import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { createStore } from '../src/database/store.js';
import { createSlackListClient } from '../src/sync/slack-lists.js';
import { createTodoistSync } from '../src/sync/todoist-sync.js';
import { hashContent } from '../src/sync/util.js';
import { createWebhookServer, verifySignature } from '../src/sync/webhook-server.js';

let createdPaths = [];

afterEach(() => {
  for (const databasePath of createdPaths) {
    fs.rmSync(path.dirname(databasePath), { recursive: true, force: true });
  }
  createdPaths = [];
});

function makeStore(options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-sync-'));
  const databasePath = path.join(tempDir, 'asteria.sqlite');
  createdPaths.push(databasePath);
  return createStore(databasePath, options);
}

function storePathOf() {
  return createdPaths[createdPaths.length - 1];
}

function makeColumnMap() {
  return new Map([
    ['col-text', { id: 'col-text', type: 'text', is_primary_column: true }],
    ['col-done', { id: 'col-done', type: 'checkbox', facet_type: 'todo_completed' }],
    ['col-due', { id: 'col-due', type: 'date', facet_type: 'todo_due_date' }],
  ]);
}

function makeListItem({ id, name, completed = false, due = null, createdBy = 'UUSER' }) {
  const fields = [
    { column_id: 'col-text', type: 'text', text: name },
    { column_id: 'col-done', type: 'checkbox', checkbox: [completed] },
  ];
  if (due) {
    fields.push({ column_id: 'col-due', type: 'date', date: [due] });
  }
  return { id, fields, created_by: createdBy };
}

describe('Asteria sync store', () => {
  it('defaults sync settings and seeds them from store options', async () => {
    const store = await makeStore({
      todoistApiToken: 'token',
      slackListId: 'F0C37D72NNM',
      notificationChannelId: 'C123',
    });
    const settings = store.getSyncSettings();

    assert.equal(settings.todoist_api_token, 'token');
    assert.equal(settings.slack_list_id, 'F0C37D72NNM');
    assert.equal(settings.notification_channel_id, 'C123');
    assert.equal(settings.todoist_project_name, 'Public Slack To Do List');
    assert.equal(settings.enabled, false);
    assert.equal(settings.poll_interval_seconds, 300);
    store.close();
  });

  it('seeds enabled, webhook secret, and poll interval from store options', async () => {
    const store = await makeStore({
      todoistWebhookSecret: 'secret-123',
      syncEnabled: true,
      syncPollIntervalSeconds: 60,
    });
    const settings = store.getSyncSettings();

    assert.equal(settings.enabled, true);
    assert.equal(settings.webhook_secret, 'secret-123');
    assert.equal(settings.poll_interval_seconds, 60);
    store.close();
  });

  it('does not overwrite an existing webhook secret from environment', async () => {
    const store = await makeStore({ todoistWebhookSecret: 'secret-123' });
    store.updateSyncSettings({ webhook_secret: 'runtime-secret' });
    store.close();

    const reopened = await createStore(storePathOf(), { todoistWebhookSecret: 'env-secret' });
    assert.equal(reopened.getSyncSettings().webhook_secret, 'runtime-secret');
    reopened.close();
  });

  it('does not re-enable sync from environment once disabled in the UI', async () => {
    const store = await makeStore({ syncEnabled: true });
    store.updateSyncSettings({ enabled: false });
    store.close();

    const reopened = await createStore(storePathOf(), { syncEnabled: true });
    assert.equal(reopened.getSyncSettings().enabled, false);
    reopened.close();
  });

  it('sanitizes sync settings updates', async () => {
    const store = await makeStore();
    store.updateSyncSettings({
      enabled: true,
      poll_interval_seconds: '60',
      todoist_api_token: '  token  ',
      slack_list_id: ' F0C37D72NNM ',
    });

    const settings = store.getSyncSettings();
    assert.equal(settings.enabled, true);
    assert.equal(settings.poll_interval_seconds, 60);
    assert.equal(settings.todoist_api_token, 'token');
    assert.equal(settings.slack_list_id, 'F0C37D72NNM');
    store.close();
  });

  it('rejects absurd poll intervals and falls back to default', async () => {
    const store = await makeStore();
    store.updateSyncSettings({ poll_interval_seconds: '2' });
    assert.equal(store.getSyncSettings().poll_interval_seconds, 300);
    store.close();
  });

  it('upserts and queries sync items by slack or todoist id', async () => {
    const store = await makeStore();
    store.upsertSyncItem({
      slackItemId: 'Rec1',
      todoistTaskId: '9001',
      addedBy: 'UUSER',
      isCompleted: false,
      nameHash: 'hash-a',
    });

    assert.equal(store.getSyncItemBySlackItemId('Rec1').todoist_task_id, '9001');
    assert.equal(store.getSyncItemByTodoistTaskId('9001').slack_item_id, 'Rec1');
    assert.equal(store.listSyncItems().length, 1);

    store.upsertSyncItem({
      slackItemId: 'Rec1',
      todoistTaskId: '9002',
      addedBy: 'UUSER',
      isCompleted: true,
      nameHash: 'hash-b',
    });
    const updated = store.getSyncItemBySlackItemId('Rec1');
    assert.equal(updated.todoist_task_id, '9002');
    assert.equal(updated.is_completed, 1);

    store.updateSyncItemCompletion('9002', false, 'hash-c');
    assert.equal(store.getSyncItemByTodoistTaskId('9002').is_completed, 0);
    assert.equal(store.getSyncItemByTodoistTaskId('9002').name_hash, 'hash-c');
    store.close();
  });
});

describe('Slack list client', () => {
  it('extracts name, completion, due date, and added-by from list items', () => {
    const client = createSlackListClient({ client: {}, logger: undefined });
    const columnMap = makeColumnMap();
    const item = makeListItem({
      id: 'Rec1',
      name: 'Write the spec',
      completed: true,
      due: '2026-09-30',
      createdBy: 'UOWNER',
    });

    assert.equal(client.extractItemName(item, columnMap), 'Write the spec');
    assert.equal(client.extractCompletion(item, columnMap), true);
    assert.equal(client.extractDueDate(item, columnMap), '2026-09-30');
    assert.equal(client.extractAddedBy(item), 'UOWNER');
  });

  it('falls back gracefully for items without a checkbox or due date', () => {
    const client = createSlackListClient({ client: {}, logger: undefined });
    const columnMap = makeColumnMap();
    const item = { id: 'Rec9', fields: [{ column_id: 'col-text', type: 'text', text: 'Plain task' }] };

    assert.equal(client.extractCompletion(item, columnMap), false);
    assert.equal(client.extractDueDate(item, columnMap), null);
    assert.equal(client.extractAddedBy(item), '');
  });
});

describe('Todoist webhook signature', () => {
  it('accepts a valid SHA256 HMAC signature', () => {
    const secret = 'shhh';
    const body = JSON.stringify({ event_name: 'item:completed' });
    const signature = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
    assert.equal(verifySignature(body, secret, signature), true);
  });

  it('rejects a tampered or missing signature', () => {
    const secret = 'shhh';
    const body = JSON.stringify({ event_name: 'item:completed' });
    const signature = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
    assert.equal(verifySignature(body, secret, `${signature.slice(0, 10)}deadbeef`), false);
    assert.equal(verifySignature(body, secret, ''), false);
    assert.equal(verifySignature(body, secret, signature), true);
  });
});

describe('Todoist sync service', () => {
  function makeSync({ todoistLog, slackLog, store, completionMessages = [] }) {
    const recorder = {
      addTaskCalls: [],
      updateTaskCalls: [],
      completeTaskCalls: [],
      reopenTaskCalls: [],
    };
    let taskIdCounter = 0;

    const todoistClient = {
      async addTask(input) {
        recorder.addTaskCalls.push(input);
        taskIdCounter += 1;
        return { id: `task-${taskIdCounter}` };
      },
      async updateTask(input) {
        recorder.updateTaskCalls.push(input);
        return { id: input.taskId };
      },
      async completeTask(taskId) {
        recorder.completeTaskCalls.push(taskId);
      },
      async reopenTask(taskId) {
        recorder.reopenTaskCalls.push(taskId);
      },
    };

    const client = {
      slackLists: {
        items: {
          async list() {
            return {
              list: { schema: Array.from(makeColumnMap().values()) },
              items: todoistLog,
            };
          },
          async update({ cells }) {
            slackLog.push(...cells);
          },
          async create() {
            throw new Error('not used in these tests');
          },
        },
      },
      chat: {
        async postMessage({ text }) {
          completionMessages.push(text);
          return { ts: '123.456' };
        },
      },
    };

    const sync = createTodoistSync({
      store,
      client,
      logger: { warn() {}, error() {}, info() {} },
      environment: { todoistApiBaseUrl: 'https://api.todoist.com/api/v1', maxRetries: 1 },
      todoistClientFactory: () => todoistClient,
    });

    return { sync, recorder, client };
  }

  it('creates Todoist tasks for new Slack list items and skips unchanged ones', async () => {
    const store = await makeStore();
    const items = [
      makeListItem({ id: 'Rec1', name: 'New task', completed: false, due: '2026-10-01', createdBy: 'UOWNER' }),
    ];
    const { sync, recorder } = makeSync({ todoistLog: items, slackLog: [], store });

    const settings = store.getSyncSettings();
    await sync.syncOnce({
      ...settings,
      todoist_api_token: 'token',
      slack_list_id: 'LIST',
    });

    assert.equal(recorder.addTaskCalls.length, 1);
    assert.equal(recorder.addTaskCalls[0].content, 'New task');
    assert.equal(recorder.addTaskCalls[0].dueDate, '2026-10-01');
    assert.equal(recorder.addTaskCalls[0].projectName, 'Public Slack To Do List');

    const createdCount = recorder.addTaskCalls.length;

    await sync.syncOnce({
      ...settings,
      todoist_api_token: 'token',
      slack_list_id: 'LIST',
    });
    assert.equal(recorder.addTaskCalls.length, createdCount, 'unchanged items should not be re-created');

    store.close();
  });

  it('updates the Todoist task when a Slack item is renamed (and does not re-sync)', async () => {
    const store = await makeStore();
    const item = makeListItem({ id: 'Rec1', name: 'Old name', completed: false, createdBy: 'UOWNER' });
    const { sync, recorder } = makeSync({ todoistLog: [item], slackLog: [], store });

    const settings = store.getSyncSettings();
    await sync.syncOnce({ ...settings, todoist_api_token: 'token', slack_list_id: 'LIST' });

    item.fields.find((field) => field.column_id === 'col-text').text = 'New name';
    await sync.syncOnce({ ...settings, todoist_api_token: 'token', slack_list_id: 'LIST' });

    assert.equal(recorder.updateTaskCalls.length, 1);
    assert.equal(recorder.updateTaskCalls[0].content, 'New name');

    await sync.syncOnce({ ...settings, todoist_api_token: 'token', slack_list_id: 'LIST' });
    assert.equal(recorder.updateTaskCalls.length, 1, 'further syncs with no changes should not update');
    store.close();
  });

  it('completes and reopens Todoist tasks as list checkboxes change', async () => {
    const store = await makeStore();
    const item = makeListItem({ id: 'Rec1', name: 'Chore', completed: false, createdBy: 'UOWNER' });
    const { sync, recorder } = makeSync({ todoistLog: [item], slackLog: [], store });

    const settings = store.getSyncSettings();
    await sync.syncOnce({ ...settings, todoist_api_token: 'token', slack_list_id: 'LIST' });

    item.fields.find((field) => field.column_id === 'col-done').checkbox = [true];
    await sync.syncOnce({ ...settings, todoist_api_token: 'token', slack_list_id: 'LIST' });
    assert.equal(recorder.completeTaskCalls.length, 1);
    assert.equal(recorder.completeTaskCalls[0], 'task-1');

    item.fields.find((field) => field.column_id === 'col-done').checkbox = [false];
    await sync.syncOnce({ ...settings, todoist_api_token: 'token', slack_list_id: 'LIST' });
    assert.equal(recorder.reopenTaskCalls.length, 1);
    assert.equal(recorder.reopenTaskCalls[0], 'task-1');

    store.close();
  });

  it('handles an item:completed webhook by checking the list and posting a message', async () => {
    const store = await makeStore();
    store.upsertSyncItem({
      slackItemId: 'Rec1',
      todoistTaskId: '999',
      addedBy: 'UOWNER',
      isCompleted: false,
      nameHash: hashContent('Ship it|false|'),
    });

    const items = [makeListItem({ id: 'Rec1', name: 'Ship it', completed: false, createdBy: 'UOWNER' })];
    const completionMessages = [];
    const slackLog = [];
    const { sync } = makeSync({ todoistLog: items, slackLog, store, completionMessages });

    const settings = store.getSyncSettings();
    await sync.handleTodoistEvent(
      {
        event_name: 'item:completed',
        event_data: { id: '999', content: 'Ship it' },
      },
      { ...settings, slack_list_id: 'LIST', notification_channel_id: 'C123' },
    );

    assert.equal(slackLog.length, 1);
    assert.equal(slackLog[0].checkbox, true);
    assert.equal(completionMessages.length, 1);
    assert.match(completionMessages[0], /Ship it/);
    assert.match(completionMessages[0], /<@UOWNER>/);
    store.close();
  });

  it('ignores webhooks for tasks it did not create', async () => {
    const store = await makeStore();
    const items = [];
    const { sync } = makeSync({ todoistLog: items, slackLog: [], store });

    const settings = store.getSyncSettings();
    await sync.handleTodoistEvent(
      { event_name: 'item:completed', event_data: { id: 'UNKNOWN', content: 'Nope' } },
      { ...settings, slack_list_id: 'LIST' },
    );

    assert.equal(store.listSyncItems().length, 0);
    store.close();
  });
});

describe('Todoist webhook server', () => {
  it('boots and serves /health', async () => {
    const server = createWebhookServer({
      sync: { async handleTodoistEvent() {} },
      getSettings: () => ({ webhook_secret: 'shhh' }),
      logger: { info() {}, warn() {}, error() {} },
      port: 0,
    });
    const httpServer = server.start();
    await new Promise((resolve) => httpServer.once('listening', resolve));
    const port = httpServer.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);

    server.stop();
  });
});
