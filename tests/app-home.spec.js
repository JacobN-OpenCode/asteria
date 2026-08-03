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
      handlers[actionId] = handler;
    },
    event: (eventName, handler) => {
      handlers[`event:${eventName}`] = handler;
    },
    error: mock.fn(),
  };
  createHomeHandlers({ app, store });
  return handlers;
}

function buildDailyUpdateViewState() {
  return {
    daily_update_main_block: {
      daily_update_main_text: { value: 'Today update' },
    },
    daily_update_song_block: {
      daily_update_song_text: { value: 'Song' },
    },
    daily_update_event_block: {
      daily_update_event_text: { value: 'Event' },
    },
    daily_update_thread_toggle_block: {
      daily_update_thread_enabled: {
        selected_options: [{ value: 'enabled' }],
      },
    },
    daily_update_thread_message_block: {
      daily_update_thread_message: { value: ':thread: here please!!' },
    },
  };
}

describe('App Home handlers', () => {
  it('persists the thread starter toggle and message when sending a Daily Update', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-apphome-'));
    const databasePath = path.join(tempDir, 'asteria.sqlite');
    createdPaths.push(databasePath);

    const store = await createStore(databasePath);
    store.updateSettings({
      personal_channel_owner_id: 'UOWNER',
      personal_channel_id: 'C123',
      daily_update_ping_user_group_id: 'S123',
    });

    const client = {
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
      },
      usergroups: {
        list: mock.fn(async () => ({ usergroups: [] })),
      },
    };

    const handlers = createHandlerTestHarness({ store, client });

    await handlers.send_daily_update({
      ack: mock.fn(),
      body: {
        user: { id: 'UOWNER' },
        view: {
          state: {
            values: buildDailyUpdateViewState(),
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
    const threadCall = client.chat.postMessage.mock.calls[1].arguments[0];
    assert.equal(threadCall.thread_ts, '111.222');
    assert.equal(threadCall.username, 'Asteria');
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

    const client = {
      chat: {
        postMessage: mock.fn(),
      },
      views: {
        publish: mock.fn(async () => ({})),
      },
      usergroups: {
        list: mock.fn(async () => ({ usergroups: [] })),
      },
    };

    const handlers = createHandlerTestHarness({ store, client });

    await handlers.send_daily_update({
      ack: mock.fn(),
      body: {
        user: { id: 'UNOTOWNER' },
        view: {
          state: {
            values: buildDailyUpdateViewState(),
          },
        },
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
});
