import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';
import { createHomeHandlers } from '../src/app-home/handlers.js';
import { createStore } from '../src/database/store.js';

let createdPaths = [];

afterEach(() => {
  for (const databasePath of createdPaths) {
    fs.rmSync(path.dirname(databasePath), { recursive: true, force: true });
  }
  createdPaths = [];
});

function createHandlerTestHarness({ store }) {
  const handlers = {};
  const app = {
    action: (actionId, handler) => {
      handlers[`action:${actionId}`] = handler;
    },
    view: (callbackId, handler) => {
      handlers[`view:${callbackId}`] = handler;
    },
    options: (actionId, handler) => {
      handlers[`options:${actionId}`] = handler;
    },
    event: (eventName, handler) => {
      handlers[`event:${eventName}`] = handler;
    },
    error: mock.fn(),
  };
  const { publishTab } = createHomeHandlers({ app, store });
  return { ...handlers, publishTab };
}

function createClient() {
  return {
    users: {
      profile: {
        get: mock.fn(async () => ({
          profile: {
            display_name: 'Jordan',
            image_192: 'https://example.com/avatar-192.png',
          },
        })),
      },
    },
    chat: {
      postMessage: mock.fn(async () => ({ ts: '111.222' })),
    },
    views: {
      publish: mock.fn(async () => ({})),
      open: mock.fn(async () => ({})),
    },
    usergroups: {
      list: mock.fn(async () => ({ usergroups: [] })),
    },
  };
}

const THREAD_TOGGLE_STATE = {
  daily_update_thread_toggle_block: {
    daily_update_thread_enabled: {
      selected_options: [{ value: 'enabled' }],
    },
  },
};

describe('App Home handlers', () => {
  it('sends the Daily Update from the saved draft and clears it on success', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({
      personal_channel_owner_id: 'UOWNER',
      personal_channel_id: 'C123',
      daily_update_ping_user_group_id: 'S123',
      daily_update_thread_enabled: true,
      daily_update_thread_message: ':thread: here please!!',
    });
    store.saveDraft({
      main_update_text: 'Today update',
      song_text: 'Song',
      event_text: 'Event',
    });

    const client = createClient();
    const handlers = createHandlerTestHarness({ store });

    await handlers['action:send_daily_update']({
      ack: mock.fn(),
      body: {
        user: { id: 'UOWNER' },
        view: {
          state: {
            values: THREAD_TOGGLE_STATE,
          },
        },
      },
      client,
      logger: { error: mock.fn() },
    });

    const settings = store.getSettings();
    assert.equal(settings.daily_update_thread_enabled, true);
    assert.equal(settings.daily_update_thread_message, ':thread: here please!!');

    assert.equal(client.chat.postMessage.mock.callCount(), 2);
    const mainCall = client.chat.postMessage.mock.calls[0].arguments[0];
    assert.equal(mainCall.username, 'Jordan');
    assert.equal(mainCall.icon_url, 'https://example.com/avatar-192.png');
    assert(mainCall.text.includes('Today update'));
    const threadCall = client.chat.postMessage.mock.calls[1].arguments[0];
    assert.equal(threadCall.thread_ts, '111.222');
    assert.equal(threadCall.username, 'Asteria');
    assert.equal(store.getDraft().main_update_text, '');
    store.close();
  });

  it('requires a composed draft before sending the Daily Update', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({
      personal_channel_owner_id: 'UOWNER',
      personal_channel_id: 'C123',
      daily_update_ping_user_group_id: 'S123',
    });

    const client = createClient();
    const handlers = createHandlerTestHarness({ store });

    await handlers['action:send_daily_update']({
      ack: mock.fn(),
      body: {
        user: { id: 'UOWNER' },
        view: { state: { values: {} } },
      },
      client,
      logger: { error: mock.fn() },
    });

    assert.equal(client.chat.postMessage.mock.callCount(), 0);
    const publishArgs = client.views.publish.mock.calls[0].arguments[0];
    assert(publishArgs.view.blocks.some((block) => block.elements?.[0]?.text?.includes('Compose a Daily Update')));
    store.close();
  });

  it('does not let a non-owner send the Daily Update', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({
      personal_channel_owner_id: 'UOWNER',
      personal_channel_id: 'C123',
      daily_update_ping_user_group_id: 'S123',
    });

    const client = createClient();
    const handlers = createHandlerTestHarness({ store });

    await handlers['action:send_daily_update']({
      ack: mock.fn(),
      body: {
        user: { id: 'UNOTOWNER' },
        view: { state: { values: {} } },
      },
      client,
      logger: { error: mock.fn() },
    });

    assert.equal(client.views.publish.mock.callCount(), 1);
    assert.equal(client.chat.postMessage.mock.callCount(), 0);
    const publishArgs = client.views.publish.mock.calls[0].arguments[0];
    assert(
      publishArgs.view.blocks.some((block) =>
        block.text?.text.includes('configured for another personal channel owner'),
      ),
    );
    assert(!publishArgs.view.blocks.some((block) => block.block_id === 'navigation_tabs'));
    store.close();
  });

  it('opens the Compose Daily Update modal with a rich text editor', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({ personal_channel_owner_id: 'UOWNER' });

    const client = createClient();
    const handlers = createHandlerTestHarness({ store });

    await handlers['action:open_daily_update_modal']({
      ack: mock.fn(),
      body: { user: { id: 'UOWNER' }, trigger_id: 'trig-1' },
      client,
    });

    const callArgs = client.views.open.mock.calls[0].arguments[0];
    assert.equal(callArgs.trigger_id, 'trig-1');
    assert.equal(callArgs.view.type, 'modal');
    assert(callArgs.view.blocks.some((block) => block.element?.type === 'rich_text_input'));
    store.close();
  });

  it('saves the Daily Update draft from the compose modal', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({ personal_channel_owner_id: 'UOWNER' });

    const richTextValue = JSON.stringify([
      {
        type: 'rich_text_section',
        elements: [
          { type: 'text', text: 'Shipped ', bold: true },
          { type: 'text', text: 'Asteria' },
        ],
      },
    ]);

    const client = createClient();
    const handlers = createHandlerTestHarness({ store });

    await handlers['view:compose_daily_update_submit']({
      ack: mock.fn(),
      body: { user: { id: 'UOWNER' } },
      view: {
        state: {
          values: {
            daily_update_main_block: {
              daily_update_main_text: {
                type: 'rich_text_input',
                rich_text_value: { type: 'rich_text', elements: JSON.parse(richTextValue) },
              },
            },
            daily_update_song_block: { daily_update_song_text: { value: 'Song' } },
            daily_update_event_block: { daily_update_event_text: { value: 'Event' } },
          },
        },
      },
      client,
    });

    const draft = store.getDraft();
    assert.equal(draft.main_update_text, richTextValue);
    assert.equal(draft.song_text, 'Song');
    assert.equal(draft.event_text, 'Event');
    assert.equal(client.views.publish.mock.callCount(), 1);
    store.close();
  });

  it('saves the thread message from the edit modal', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({ personal_channel_owner_id: 'UOWNER' });

    const richTextValue = JSON.stringify([
      {
        type: 'rich_text_section',
        elements: [{ type: 'text', text: ':thread: ', bold: true }],
      },
    ]);

    const client = createClient();
    const handlers = createHandlerTestHarness({ store });

    await handlers['view:edit_thread_message_submit']({
      ack: mock.fn(),
      body: { user: { id: 'UOWNER' } },
      view: {
        state: {
          values: {
            thread_message_block: {
              thread_message_content: {
                type: 'rich_text_input',
                rich_text_value: { type: 'rich_text', elements: JSON.parse(richTextValue) },
              },
            },
          },
        },
      },
      client,
    });

    assert.equal(store.getSettings().daily_update_thread_message, richTextValue);
    store.close();
  });

  it('saves the welcome message from the edit modal', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({ personal_channel_owner_id: 'UOWNER' });

    const richTextValue = JSON.stringify([
      {
        type: 'rich_text_section',
        elements: [{ type: 'text', text: 'Welcome to the club!' }],
      },
    ]);

    const client = createClient();
    const handlers = createHandlerTestHarness({ store });

    await handlers['view:edit_welcome_message_submit']({
      ack: mock.fn(),
      body: { user: { id: 'UOWNER' } },
      view: {
        state: {
          values: {
            welcome_message_block: {
              welcome_message_content: {
                type: 'rich_text_input',
                rich_text_value: { type: 'rich_text', elements: JSON.parse(richTextValue) },
              },
            },
          },
        },
      },
      client,
    });

    assert.equal(store.getSettings().welcome_message_content, richTextValue);
    store.close();
  });

  it('saves the personal channel from the settings modal', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({ personal_channel_owner_id: 'UOWNER' });

    const client = createClient();
    const handlers = createHandlerTestHarness({ store });

    await handlers['view:edit_personal_channel_submit']({
      ack: mock.fn(),
      body: { user: { id: 'UOWNER' } },
      view: {
        state: {
          values: {
            personal_channel_block: { personal_channel_id: { selected_conversation: 'C456' } },
          },
        },
      },
      client,
    });

    assert.equal(store.getSettings().personal_channel_id, 'C456');
    store.close();
  });

  it('keeps selects out of the Settings home view and uses modal buttons instead', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({
      personal_channel_owner_id: 'UOWNER',
      personal_channel_id: 'C123',
    });

    const client = createClient();
    const handlers = createHandlerTestHarness({ store });

    await handlers.publishTab(client, 'UOWNER', 'settings');

    const publishArgs = client.views.publish.mock.calls[0].arguments[0];
    const viewJson = JSON.stringify(publishArgs.view);
    assert(!viewJson.includes('conversations_select'));
    assert(!viewJson.includes('static_select'));
    assert(publishArgs.view.blocks.some((block) => block.accessory?.action_id === 'open_personal_channel_modal'));
    assert(publishArgs.view.blocks.some((block) => block.accessory?.action_id === 'open_ping_group_modal'));
    store.close();
  });

  it('opens the ping group modal with the current group preselected', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({
      personal_channel_owner_id: 'UOWNER',
      daily_update_ping_user_group_id: 'S123',
    });

    const client = createClient();
    client.usergroups.list = mock.fn(async () => ({
      usergroups: [{ id: 'S123', name: 'Members', handle: 'members' }],
    }));

    const handlers = createHandlerTestHarness({ store });

    await handlers['action:open_ping_group_modal']({
      ack: mock.fn(),
      body: { user: { id: 'UOWNER' }, trigger_id: 'trig-2' },
      client,
    });

    const callArgs = client.views.open.mock.calls[0].arguments[0];
    assert.equal(callArgs.view.callback_id, 'edit_ping_group_submit');
    const select = callArgs.view.blocks.find((block) => block.element?.type === 'external_select');
    assert(select);
    assert.equal(select.element.initial_option.value, 'S123');
    store.close();
  });

  it('returns matching user group options for the searchable select', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({ personal_channel_owner_id: 'UOWNER' });

    const client = createClient();
    client.usergroups.list = mock.fn(async () => ({
      usergroups: [
        { id: 'S111', name: 'Hack Clubbers', handle: 'clubbers' },
        { id: 'S222', name: 'Leads', handle: 'leads' },
      ],
    }));

    const handlers = createHandlerTestHarness({ store });
    let ackedOptions = null;
    await handlers['options:select_ping_user_group']({
      ack: (options) => {
        ackedOptions = options;
      },
      payload: { value: 'leads' },
      client,
    });

    assert.equal(ackedOptions.options.length, 1);
    assert.equal(ackedOptions.options[0].value, 'S222');
    store.close();
  });

  it('saves the ping group from the modal', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({ personal_channel_owner_id: 'UOWNER' });

    const client = createClient();
    const handlers = createHandlerTestHarness({ store });

    await handlers['view:edit_ping_group_submit']({
      ack: mock.fn(),
      body: { user: { id: 'UOWNER' } },
      view: {
        state: {
          values: {
            ping_group_block: {
              select_ping_user_group: { type: 'external_select', selected_option: { value: 'S999' } },
            },
          },
        },
      },
      client,
    });

    assert.equal(store.getSettings().daily_update_ping_user_group_id, 'S999');
    store.close();
  });
});
