/**
 * Rebuild huddle attendance from the join/leave audit trail and reset the
 * leaderboard to the corrected totals.
 *
 * Why this exists: attendance used to be a single (first_seen_at, last_seen_at)
 * span per person per huddle, so every leave was overwritten by the next join
 * and the gaps were lost. Anyone who left and came back was billed for the whole
 * call, which turned a 58 second appearance into 182 minutes. The join and leave
 * events themselves were always written to `trigger_log`, so the real intervals
 * can be recovered from there.
 *
 * The old leaderboard is snapshotted into huddle_leaderboard_v1 first, so the
 * inflated numbers stay available for auditing.
 *
 * Only huddles in channels the bot is a member of are considered at all. A
 * huddle in any other channel is left untouched, not rebuilt and not scored:
 * the bot cannot prove it was inside, so it does not exist as far as this is
 * concerned. `botChannelIds` is therefore required, and an empty list means
 * nothing is eligible rather than everything being.
 *
 * Run with --dry to report exactly what would change while writing nothing.
 * The dry run is a true dry run: every number is computed in memory from the
 * same pure functions the real run uses, so the report is not an estimate.
 */

import { summariseAttendance } from '../huddles/attendance.js';
import {
  computeHuddlePoints,
  LONGEST_MESSAGE_POINTS,
  parseParticipantHistory,
  SHORTEST_MESSAGE_POINTS,
} from '../huddles/points.js';
import { createStore } from './store.js';

const KEY_SEP = '|';

/**
 * Pair each join with the next leave for the same person, oldest first.
 *
 * An unmatched join at the end of somebody's trail is left open, because we know
 * they arrived but not when they went, and inventing an end is exactly the
 * mistake this whole exercise exists to undo.
 */
export function buildIntervals(events) {
  const perUser = new Map();
  for (const event of events) {
    if (!perUser.has(event.userId)) {
      perUser.set(event.userId, []);
    }
    perUser.get(event.userId).push(event);
  }

  const intervals = [];
  for (const [userId, list] of perUser) {
    list.sort((a, b) => a.at - b.at);
    let open = null;
    for (const event of list) {
      if (event.kind === 'join') {
        // A join while one is already open is a duplicate delivery, not a second
        // stretch, so the open one is kept and the duplicate dropped.
        if (!open) {
          open = { userId, joinedAt: event.at, leftAt: null };
        }
        continue;
      }
      if (open) {
        // A leave that predates the join means the events arrived out of order.
        // Closing on it would invent a negative stretch, so the pair is dropped.
        if (event.at >= open.joinedAt) {
          intervals.push({ ...open, leftAt: event.at });
        }
        open = null;
      }
    }
    if (open) {
      intervals.push(open);
    }
  }
  return intervals.sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId));
}

/**
 * Recompute every leaderboard total from corrected attendance.
 *
 * Only huddles that could ever have been scored are included: one with a channel
 * the bot was inside, a start and an end. Longest and shortest message bonuses
 * are not replayed, because the original message stats were never stored and
 * re-deriving them would invent awards. The corrected total is therefore a
 * floor, and the size of that floor is reported.
 */
export async function recomputeAttendance({ store, dryRun = false, botChannelIds = null }) {
  const huddles = store.listHuddles();
  // Required, and an empty list means nothing is eligible. Refusing to guess is
  // the whole point: a migration that silently scores huddles the bot was never
  // inside is the bug we are here to remove.
  const memberChannels = new Set(Array.isArray(botChannelIds) ? botChannelIds : []);

  // One pass over the audit trail, grouped by huddle, rather than rescanning the
  // whole log for each huddle in turn.
  const trailByCall = new Map();
  for (const row of store.listHuddleTrailEvents()) {
    if (!trailByCall.has(row.call_id)) {
      trailByCall.set(row.call_id, []);
    }
    const at = Date.parse(String(row.created_at).replace(' ', 'T') + 'Z') / 1000;
    if (!Number.isFinite(at)) {
      continue;
    }
    trailByCall.get(row.call_id).push({
      userId: row.user_id,
      at,
      kind: row.action === 'huddle_join' ? 'join' : 'leave',
    });
  }

  const totals = new Map();
  const channelTotals = new Map();
  const rebuilt = [];
  let intervalsBuilt = 0;
  let scored = 0;
  let partialHuddles = 0;
  let outsideBotChannels = 0;
  let skippedNotScorable = 0;
  let openIntervals = 0;

  for (const huddle of huddles) {
    if (!huddle.call_id) {
      continue;
    }
    if (!huddle.channel_id) {
      // Heard about through a presence event and never attributed to a channel.
      outsideBotChannels += 1;
      continue;
    }
    if (!memberChannels.has(huddle.channel_id)) {
      // A channel the bot is not in. Left exactly as it is: not rebuilt, not
      // scored, not reported on, not deleted.
      outsideBotChannels += 1;
      continue;
    }

    const rows = [];
    for (const interval of buildIntervals(trailByCall.get(huddle.call_id) || [])) {
      rows.push({
        call_id: huddle.call_id,
        user_id: interval.userId,
        joined_at: interval.joinedAt,
        left_at: interval.leftAt,
        inferred: 0,
      });
      intervalsBuilt += 1;
    }

    // Anyone Slack says joined but who never appears in the trail still counts as
    // having been there, with a duration we cannot prove.
    const known = new Set(rows.map((entry) => entry.user_id));
    for (const userId of parseParticipantHistory(huddle)) {
      if (!known.has(userId)) {
        rows.push({
          call_id: huddle.call_id,
          user_id: userId,
          joined_at: huddle.started_at || 0,
          left_at: null,
          inferred: 0,
        });
        intervalsBuilt += 1;
        openIntervals += 1;
      }
    }

    // A start of 0 or less is not a real epoch, so it means we never learned one.
    if (huddle.started_at <= 0 || !huddle.ended_at) {
      // Still running, or an end we never learned. Attendance is still rebuilt,
      // so the record is right, but it cannot score until it closes.
      rebuilt.push({ huddle, rows });
      skippedNotScorable += 1;
      continue;
    }

    const attendance = summariseAttendance(rows, { startedAt: huddle.started_at, endedAt: huddle.ended_at });
    if (attendance.partial) {
      partialHuddles += 1;
    }

    const awards = computeHuddlePoints({
      huddle,
      members: [],
      attendance,
      participantHistory: [],
      messageStats: null,
    });

    for (const [userId, entry] of awards) {
      totals.set(userId, (totals.get(userId) || 0) + entry.points);
      const key = `${huddle.channel_id}${KEY_SEP}${userId}`;
      channelTotals.set(key, (channelTotals.get(key) || 0) + entry.points);
    }
    rebuilt.push({ huddle, rows });
    scored += 1;
  }

  // Read the old totals before writing anything, so the report shows the change
  // rather than the value it just wrote.
  const beforeByUser = new Map(store.listLeaderboardTotals().map((row) => [row.user_id, Number(row.points)]));
  const beforeByChannel = new Map(
    store.listChannelPointTotals().map((row) => [`${row.channel_id}${KEY_SEP}${row.user_id}`, Number(row.points)]),
  );

  // Reset every row rather than only the ones that gained a recomputed total.
  // Points awarded long ago for huddles the bot cannot prove it was inside
  // cannot be justified by anything the current rules would award, so they are
  // zeroed instead of being left on top of attendance we know was wrong.
  const allUsers = new Set([...beforeByUser.keys(), ...totals.keys()]);
  let usersZeroed = 0;
  let pointsRemoved = 0;

  for (const userId of allUsers) {
    const was = beforeByUser.get(userId) || 0;
    const points = totals.get(userId) || 0;
    if (was > 0 && points === 0) {
      usersZeroed += 1;
    }
    pointsRemoved += Math.max(0, was - points);
  }

  if (!dryRun) {
    // Everything above was computed in memory, so the write is a straight
    // replay of numbers that have already been decided.
    store.snapshotLeaderboard();
    store.clearHuddleAttendance();
    for (const { huddle, rows } of rebuilt) {
      for (const entry of rows) {
        store.insertHuddleAttendance({
          callId: huddle.call_id,
          userId: entry.user_id,
          joinedAt: entry.joined_at,
          leftAt: entry.left_at,
          inferred: entry.inferred,
        });
      }
    }
    for (const userId of allUsers) {
      store.setLeaderboardTotals(userId, totals.get(userId) || 0);
    }
    for (const [key, points] of channelTotals) {
      const [channelId, userId] = key.split(KEY_SEP);
      store.setChannelPointTotals(channelId, userId, points);
    }
    for (const key of beforeByChannel.keys()) {
      if (channelTotals.has(key)) {
        continue;
      }
      const [channelId, userId] = key.split(KEY_SEP);
      store.setChannelPointTotals(channelId, userId, 0);
    }
  }

  const biggest = [...allUsers]
    .map((userId) => ({ userId, was: beforeByUser.get(userId) || 0, now: totals.get(userId) || 0 }))
    .filter((row) => row.was !== row.now)
    .sort((a, b) => b.was - b.now - (a.was - a.now))
    .slice(0, 12);

  return {
    dryRun,
    botChannels: [...memberChannels].sort(),
    huddles: huddles.length,
    outsideBotChannels,
    intervalsRebuilt: intervalsBuilt,
    openIntervals,
    scored,
    skippedNotScorable,
    partialHuddles,
    usersReset: allUsers.size,
    usersZeroed,
    pointsRemoved,
    // The most that could still be missing: one longest and one shortest message
    // bonus per scored huddle, which were never written down.
    unrecountableBonusCeiling: scored * (LONGEST_MESSAGE_POINTS + SHORTEST_MESSAGE_POINTS),
    biggest,
  };
}

if (process.argv[1] && process.argv[1].endsWith('recompute-attendance.js')) {
  const dbPath = process.argv.find((arg) => arg.startsWith('--db='))?.slice(5);
  if (!dbPath) {
    console.error('Pass --db=/path/to/asteria.sqlite');
    process.exit(1);
  }
  // The list of channels the bot is in. Required: without it we cannot tell our
  // own huddles from everybody else's, and guessing would rebuild the exact
  // mess this script exists to clean up.
  const channelsArg = process.argv.find((arg) => arg.startsWith('--channels='))?.slice('--channels='.length);
  if (!channelsArg) {
    console.error('Pass --channels=C1,C2 with every channel the bot is a member of.');
    console.error('Huddles in any channel not on that list are left untouched.');
    process.exit(1);
  }
  const botChannelIds = channelsArg
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (botChannelIds.length === 0) {
    console.error('--channels was empty, so nothing would be eligible. Refusing to run.');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry');
  const store = await createStore(dbPath);
  const result = await recomputeAttendance({ store, dryRun, botChannelIds });
  console.log(JSON.stringify(result, null, 2));
  store.close();
}
