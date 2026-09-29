import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, mock, test } from 'node:test';

import { createStore } from '../src/database/store.js';
import { createHuddleTracker } from '../src/huddles/tracker.js';

// The hard invariant: Asteria only ever considers huddles in channels it is a
// member of. Everything else must be dropped at the door, not filtered later,
// because filtering later still means it was stored, seen and reasoned about.

const BOT_CHANNEL = 'Cinside';
const OUTSIDE_CHANNEL = 'Coutside';

function createClient() {
  return {
    auth: { test: mock.fn(async () => ({ user_id: 'BOTUSER', bot_id: 'BOT123' })) },
    users: {
      info: mock.fn(async ({ user }) => ({
        user: { id: user, profile: { display_name: `name-${user}` } },
      })),
    },
    chat: {
      postMessage: mock.fn(async () => ({ ts: '111.222' })),
      getPermalink: mock.fn(async () => ({ permalink: 'https://example.slack.com/archives/C/p1' })),
      update: mock.fn(async () => ({ ts: '111.222' })),
      postEphemeral: mock.fn(async () => ({ ok: true })),
    },
    conversations: {
      open: mock.fn(async () => ({ channel: { id: 'Dquiet' } })),
      history: mock.fn(async () => ({ messages: [] })),
      replies: mock.fn(async () => ({ messages: [] })),
    },
  };
}

async function harness({ botChannelIds = [BOT_CHANNEL], listImpl = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-scope-'));
  const store = await createStore(path.join(dir, 'asteria.sqlite'));
  const handlers = {};
  const app = {
    event: (name, handler) => {
      handlers[`event:${name}`] = handler;
    },
    message: (handler) => {
      handlers.message = handler;
    },
    action: (id, handler) => {
      handlers[`action:${id}`] = handler;
    },
    error: mock.fn(),
  };
  const client = createClient();
  const list = listImpl || mock.fn(async () => botChannelIds);
  const tracker = createHuddleTracker({
    app,
    store,
    client,
    logger: { error: mock.fn(), warn: mock.fn(), info: mock.fn() },
    ownerId: 'UOWNER',
    botChannels: { list, invalidate: () => {} },
  });
  return { store, client, handlers, tracker, list, dir };
}

function huddleThread({ callId, channel, startedAt, endedAt = 0, createdBy = 'UOWNER' }) {
  return {
    message: {
      subtype: 'huddle_thread',
      channel,
      ts: `${endedAt || startedAt + 60}.000000`,
      room: {
        id: callId,
        call_family: 'huddle',
        created_by: createdBy,
        date_start: startedAt,
        date_end: endedAt,
        thread_root_ts: `${startedAt}.000000`,
        channels: channel ? [channel] : [],
        participant_history: ['UOWNER', 'U9'],
      },
    },
  };
}

async function join(handlers, userId, callId) {
  await handlers['event:user_huddle_changed']({
    event: { user: { id: userId, profile: { huddle_state: 'in_a_huddle', huddle_state_call_id: callId } } },
  });
}

describe('huddles are only ever considered in channels the bot is in', () => {
  test('a huddle in a channel the bot is not in is not recorded at all', async () => {
    const { store, client, handlers, tracker } = await harness();

    await join(handlers, 'U9', 'Routside');
    await handlers.message(
      huddleThread({ callId: 'Routside', channel: OUTSIDE_CHANNEL, startedAt: 172000, endedAt: 172600 }),
    );

    // The join event carries no channel, so all that exists is a placeholder
    // held as unverified. The thread message is what would give it a channel,
    // and that is where it is refused, so it is never promoted to a huddle.
    const held = store.getHuddle('Routside');
    assert.equal(held.status, 'unverified', 'never promoted past unverified');
    assert.equal(held.channel_id, '', 'with no channel attached');
    assert.equal(held.ended_at, null, 'and never finalised');
    assert.deepEqual(store.listHuddleMembers('Routside'), [], 'no members');
    assert.deepEqual(store.listHuddleAttendance('Routside'), [], 'no attendance');
    assert.deepEqual(store.listHuddleLeaderboard(), [], 'no points');
    assert.equal(client.chat.postMessage.mock.callCount(), 0, 'and nothing is said in the channel');

    tracker.stop();
  });

  test('a huddle in a channel the bot is in is tracked normally', async () => {
    const { store, handlers, tracker } = await harness();

    await join(handlers, 'U9', 'Rinside');
    await handlers.message(
      huddleThread({ callId: 'Rinside', channel: BOT_CHANNEL, startedAt: 172000, endedAt: 172600 }),
    );

    assert.equal(store.getHuddle('Rinside').channel_id, BOT_CHANNEL, 'it is recorded');
    assert.equal(store.getHuddle('Rinside').status, 'ended', 'and finalised');
    assert(store.listHuddleLeaderboard().length > 0, 'and it scores');

    tracker.stop();
  });

  test('a channel the bot is not in is never scored even with a full history', async () => {
    const { store, handlers, tracker } = await harness();

    // Both channels behave identically from Slack's point of view. Only one is
    // in the bot's membership list, and that alone has to decide the outcome.
    await join(handlers, 'UOWNER', 'Rin');
    await handlers.message(huddleThread({ callId: 'Rin', channel: BOT_CHANNEL, startedAt: 172000, endedAt: 172600 }));
    const insidePoints = store.listHuddleLeaderboard().length;

    await join(handlers, 'UOWNER', 'Rout');
    await handlers.message(
      huddleThread({ callId: 'Rout', channel: OUTSIDE_CHANNEL, startedAt: 172000, endedAt: 172600 }),
    );

    assert.equal(store.getHuddle('Rout').status, 'unverified', 'the outside huddle is never promoted');
    assert.equal(store.getHuddle('Rout').channel_id, '', 'and never gets a channel');
    assert.equal(store.listHuddleLeaderboard().length, insidePoints, 'and it added no points');

    tracker.stop();
  });

  test('fails closed when the bot cannot be shown to be in the channel', async () => {
    // A membership lookup that throws must not be treated as permission.
    const { store, handlers, tracker } = await harness({
      listImpl: mock.fn(async () => {
        throw new Error('slack is down');
      }),
    });

    await join(handlers, 'U9', 'Runknown');
    await handlers.message(
      huddleThread({ callId: 'Runknown', channel: BOT_CHANNEL, startedAt: 172000, endedAt: 172600 }),
    );

    assert.equal(store.getHuddle('Runknown').status, 'unverified', 'cannot prove means no promotion');
    assert.equal(store.getHuddle('Runknown').channel_id, '', 'and no channel');
    assert.deepEqual(store.listHuddleLeaderboard(), [], 'and no points');

    tracker.stop();
  });

  test('fails closed when there is no membership source at all', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-scope-'));
    const store = await createStore(path.join(dir, 'asteria.sqlite'));
    const handlers = {};
    const app = {
      event: (n, h) => {
        handlers[`event:${n}`] = h;
      },
      message: (h) => {
        handlers.message = h;
      },
      action: () => {},
      error: mock.fn(),
    };
    const tracker = createHuddleTracker({
      app,
      store,
      client: createClient(),
      logger: { error: mock.fn(), warn: mock.fn(), info: mock.fn() },
      ownerId: 'UOWNER',
    });

    await join(handlers, 'U9', 'Rnomember');
    await handlers.message(
      huddleThread({ callId: 'Rnomember', channel: BOT_CHANNEL, startedAt: 172000, endedAt: 172600 }),
    );

    assert.equal(store.getHuddle('Rnomember').status, 'unverified', 'no membership source means no promotion');
    assert.equal(store.getHuddle('Rnomember').channel_id, '');
    assert.deepEqual(store.listHuddleLeaderboard(), []);

    tracker.stop();
  });

  test('a DM the bot is actually inside is still tracked', async () => {
    // Membership is what matters, not being a public channel. The bot can be in
    // a huddle held in a DM, and that huddle is genuinely the bot's to track.
    const { store, handlers, tracker } = await harness({ botChannelIds: ['Dquiet'] });

    await join(handlers, 'U9', 'Rdm');
    await handlers.message(huddleThread({ callId: 'Rdm', channel: 'Dquiet', startedAt: 172000, endedAt: 172600 }));

    assert.equal(store.getHuddle('Rdm').channel_id, 'Dquiet', 'a DM the bot is in is recorded');
    assert.equal(store.getHuddle('Rdm').status, 'ended');

    tracker.stop();
  });
});
