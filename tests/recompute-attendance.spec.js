import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { buildIntervals, recomputeAttendance } from '../src/database/recompute-attendance.js';
import { createStore } from '../src/database/store.js';

const T0 = 1_700_000_000;
const INSIDE = 'Cinside';
const OUTSIDE = 'Coutside';

const created = [];
async function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-recompute-'));
  created.push(dir);
  return createStore(path.join(dir, 'asteria.sqlite'));
}

/**
 * A huddle that ran from `start` to `end` in `channel`, with the given trails.
 *
 * The trails are written as real trigger log rows, because that is where the
 * rebuild reads from.
 */
function seedHuddle(store, { callId, channel, startedAt, endedAt, createdBy = 'UOWNER', trails, history = [] }) {
  store.upsertHuddle({
    callId,
    channelId: channel,
    createdBy,
    startedAt,
    endedAt: endedAt || null,
    threadRootTs: `${startedAt}.000000`,
    participantHistory: history,
  });
  if (endedAt) {
    store.setHuddleStatus(callId, 'ended', endedAt);
  }
  for (const [userId, at, action] of trails) {
    store.recordTriggerLog({
      userId,
      action,
      detail: callId,
      channelId: channel,
      createdAt: new Date(at * 1000).toISOString().slice(0, 19).replace('T', ' '),
    });
  }
}

after(() => {
  for (const dir of created) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('pairing the audit trail into intervals', () => {
  test('pairs each join with the next leave', () => {
    const intervals = buildIntervals([
      { userId: 'U1', at: 0, kind: 'join' },
      { userId: 'U1', at: 60, kind: 'leave' },
      { userId: 'U1', at: 120, kind: 'join' },
      { userId: 'U1', at: 180, kind: 'leave' },
    ]);
    assert.deepEqual(intervals, [
      { userId: 'U1', joinedAt: 0, leftAt: 60 },
      { userId: 'U1', joinedAt: 120, leftAt: 180 },
    ]);
  });

  test('leaves a trailing join open rather than inventing an end', () => {
    const intervals = buildIntervals([{ userId: 'U1', at: 0, kind: 'join' }]);
    assert.deepEqual(intervals, [{ userId: 'U1', joinedAt: 0, leftAt: null }]);
  });

  test('drops a leave that arrives before its join', () => {
    const intervals = buildIntervals([
      { userId: 'U1', at: 30, kind: 'leave' },
      { userId: 'U1', at: 50, kind: 'join' },
    ]);
    assert.deepEqual(intervals, [{ userId: 'U1', joinedAt: 50, leftAt: null }], 'never a negative stretch');
  });

  test('a duplicate join does not create a second stretch', () => {
    const intervals = buildIntervals([
      { userId: 'U1', at: 0, kind: 'join' },
      { userId: 'U1', at: 10, kind: 'join' },
      { userId: 'U1', at: 60, kind: 'leave' },
    ]);
    assert.deepEqual(intervals, [{ userId: 'U1', joinedAt: 0, leftAt: 60 }]);
  });

  test('a leave with nothing open is dropped', () => {
    assert.deepEqual(buildIntervals([{ userId: 'U1', at: 30, kind: 'leave' }]), []);
  });
});

describe('rebuilding attendance', () => {
  test('a dry run writes absolutely nothing', async () => {
    const store = await freshStore();
    seedHuddle(store, {
      callId: 'R1',
      channel: INSIDE,
      startedAt: T0,
      endedAt: T0 + 3600,
      trails: [
        ['U1', T0, 'huddle_join'],
        ['U1', T0 + 60, 'huddle_leave'],
      ],
    });
    // Put a leaderboard total there to be wiped.
    store.setLeaderboardTotals('U1', 500);

    const before = {
      attendance: store.listHuddleAttendance('R1'),
      totals: store.listLeaderboardTotals(),
      snapshots: store.countLeaderboardSnapshots(),
    };

    const result = await recomputeAttendance({ store, dryRun: true, botChannelIds: [INSIDE] });

    assert.equal(result.dryRun, true);
    assert.deepEqual(store.listHuddleAttendance('R1'), before.attendance, 'attendance is untouched');
    assert.deepEqual(store.listLeaderboardTotals(), before.totals, 'the leaderboard is untouched');
    assert.equal(store.countLeaderboardSnapshots(), before.snapshots, 'no snapshot was taken');
    assert.equal(store.listLeaderboardTotals()[0].points, 500, 'the old total is still there');

    // It still reports what it would do, without having done it.
    assert.equal(result.scored, 1);
    const change = result.biggest.find((row) => row.userId === 'U1');
    assert.ok(change, 'it reports the change it would make');
    assert.equal(change.was, 500, 'the inflated total it read');
    assert.ok(change.now > 0 && change.now < 500, `corrected to ${change.now}, which is a real total`);
    assert.equal(store.listLeaderboardTotals()[0].points, 500, 'and the database still holds the old one');

    store.close();
  });

  test('a real run rewrites attendance and the leaderboard', async () => {
    const store = await freshStore();
    seedHuddle(store, {
      callId: 'R1',
      channel: INSIDE,
      startedAt: T0,
      endedAt: T0 + 3600,
      createdBy: 'U1',
      trails: [
        ['U1', T0, 'huddle_join'],
        ['U1', T0 + 60, 'huddle_leave'],
      ],
    });
    store.setLeaderboardTotals('U1', 500);

    const result = await recomputeAttendance({ store, dryRun: false, botChannelIds: [INSIDE] });

    assert.equal(result.dryRun, false);
    const attendance = store.listHuddleAttendance('R1');
    assert.equal(attendance.length, 1);
    assert.equal(Number(attendance[0].joined_at), T0);
    assert.equal(Number(attendance[0].left_at), T0 + 60, 'the 58 second style gap is preserved, not filled');
    assert.ok(store.listLeaderboardTotals()[0].points < 500, 'the inflated total came down');
    assert.equal(store.countLeaderboardSnapshots(), 1, 'the old total was snapshotted first');

    store.close();
  });

  test('a dry run and a real run agree exactly', async () => {
    const seed = (store) => {
      seedHuddle(store, {
        callId: 'Ra',
        channel: INSIDE,
        startedAt: 0,
        endedAt: 3600,
        createdBy: 'U1',
        trails: [
          ['U1', 0, 'huddle_join'],
          ['U1', 60, 'huddle_leave'],
          ['U2', 0, 'huddle_join'],
          ['U2', 600, 'huddle_leave'],
        ],
      });
      seedHuddle(store, {
        callId: 'Rb',
        channel: INSIDE,
        startedAt: T0 + 7200,
        endedAt: T0 + 10800,
        createdBy: 'U2',
        trails: [
          ['U2', T0 + 7200, 'huddle_join'],
          ['U2', T0 + 7800, 'huddle_leave'],
        ],
      });
      store.setLeaderboardTotals('U1', 400);
      store.setLeaderboardTotals('U2', 400);
    };

    const dryStore = await freshStore();
    seed(dryStore);
    const dry = await recomputeAttendance({ store: dryStore, dryRun: true, botChannelIds: [INSIDE] });

    const realStore = await freshStore();
    seed(realStore);
    const real = await recomputeAttendance({ store: realStore, dryRun: false, botChannelIds: [INSIDE] });

    const comparable = (result) => ({ ...result, dryRun: undefined });
    assert.deepEqual(comparable(dry), comparable(real), 'the dry run predicted the real run exactly');

    const realTotals = realStore
      .listLeaderboardTotals()
      .map((row) => `${row.user_id}:${row.points}`)
      .sort();
    const dryTotals = [...dry.biggest];
    assert.ok(dryTotals.length > 0);
    assert.ok(realTotals.length > 0);

    dryStore.close();
    realStore.close();
  });

  test('a huddle in a channel the bot is not in is left completely alone', async () => {
    const store = await freshStore();
    seedHuddle(store, {
      callId: 'Rout',
      channel: OUTSIDE,
      startedAt: T0,
      endedAt: T0 + 3600,
      trails: [
        ['U1', T0, 'huddle_join'],
        ['U1', T0 + 3000, 'huddle_leave'],
      ],
    });

    const result = await recomputeAttendance({ store, dryRun: false, botChannelIds: [INSIDE] });

    assert.equal(result.outsideBotChannels, 1, 'counted and skipped');
    assert.equal(result.scored, 0, 'and never scored');
    assert.deepEqual(store.listHuddleAttendance('Rout'), [], 'no attendance was invented for it');
    assert.deepEqual(store.listHuddleLeaderboard(), [], 'and it added no points');
    assert.equal(store.getHuddle('Rout').status, 'ended', 'the huddle itself is untouched');

    store.close();
  });

  test('a huddle with no channel at all is left completely alone', async () => {
    const store = await freshStore();
    seedHuddle(store, {
      callId: 'Rnone',
      channel: '',
      startedAt: T0,
      endedAt: T0 + 3600,
      trails: [['U1', T0, 'huddle_join']],
    });

    const result = await recomputeAttendance({ store, dryRun: false, botChannelIds: [INSIDE] });

    assert.equal(result.outsideBotChannels, 1);
    assert.equal(result.scored, 0);
    assert.deepEqual(store.listHuddleAttendance('Rnone'), [], 'not rebuilt');
    assert.deepEqual(store.listHuddleLeaderboard(), []);

    store.close();
  });

  test('without a membership list nothing is eligible', async () => {
    const store = await freshStore();
    seedHuddle(store, {
      callId: 'R1',
      channel: INSIDE,
      startedAt: T0,
      endedAt: T0 + 3600,
      trails: [
        ['U1', T0, 'huddle_join'],
        ['U1', T0 + 60, 'huddle_leave'],
      ],
    });

    const result = await recomputeAttendance({ store, dryRun: false, botChannelIds: [] });

    assert.equal(result.scored, 0, 'an empty membership list means nothing counts, not everything');
    assert.equal(result.outsideBotChannels, 1);
    assert.equal(store.countLeaderboardSnapshots(), 0, 'and nothing was written');
    assert.deepEqual(store.listHuddleAttendance('R1'), []);

    store.close();
  });

  test('a missing membership list is treated the same as an empty one', async () => {
    const store = await freshStore();
    seedHuddle(store, {
      callId: 'R1',
      channel: INSIDE,
      startedAt: T0,
      endedAt: T0 + 3600,
      trails: [['U1', T0, 'huddle_join']],
    });

    const result = await recomputeAttendance({ store, dryRun: true });

    assert.equal(result.scored, 0, 'we cannot prove membership, so we do nothing');
    assert.equal(result.outsideBotChannels, 1);

    store.close();
  });

  test('a running huddle is rebuilt but not scored', async () => {
    const store = await freshStore();
    seedHuddle(store, {
      callId: 'Rlive',
      channel: INSIDE,
      startedAt: 0,
      endedAt: null,
      trails: [['U1', T0, 'huddle_join']],
    });

    const result = await recomputeAttendance({ store, dryRun: false, botChannelIds: [INSIDE] });

    assert.equal(result.scored, 0, 'it cannot score until it closes');
    assert.equal(result.skippedNotScorable, 1);
    assert.equal(store.listHuddleAttendance('Rlive').length, 1, 'but the record is right for when it does close');
    assert.deepEqual(store.listHuddleLeaderboard(), [], 'and nothing is scored yet');

    store.close();
  });

  test('someone Slack lists but who never appears in the trail is held open, not guessed', async () => {
    const store = await freshStore();
    seedHuddle(store, {
      callId: 'Rghost',
      channel: INSIDE,
      startedAt: T0,
      endedAt: T0 + 3600,
      trails: [['U1', T0, 'huddle_join']],
      history: ['U1', 'U2'],
    });

    const result = await recomputeAttendance({ store, dryRun: false, botChannelIds: [INSIDE] });

    assert.equal(result.openIntervals, 1, 'U2 is open, so contributes nothing');
    assert.equal(result.partialHuddles, 1, 'and marks the huddle partial');
    const rows = store.listHuddleAttendance('Rghost');
    const u2 = rows.find((row) => row.user_id === 'U2');
    assert.equal(u2.left_at, null, 'we do not know when they left');
    const u1 = rows.find((row) => row.user_id === 'U1');
    assert.equal(store.computeHuddleAttendance('Rghost', { startedAt: T0, endedAt: T0 + 3600 }).partial, true);

    store.close();
  });
});
