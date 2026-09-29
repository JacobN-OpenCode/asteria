import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import { createStore } from '../src/database/store.js';

const createdPaths = [];

after(() => {
  for (const databasePath of createdPaths) {
    fs.rmSync(path.dirname(databasePath), { recursive: true, force: true });
  }
});

async function createTestStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-awards-'));
  const databasePath = path.join(tempDir, 'asteria.sqlite');
  createdPaths.push(databasePath);
  return createStore(databasePath);
}

test('huddle awards keep the points and the reason for each of them', async () => {
  const store = await createTestStore();
  store.saveHuddleAwards(
    'R1',
    'C1',
    new Map([
      ['U1', { points: 30, reasons: ['12m', 'rank 1', 'started the huddle'] }],
      ['U2', { points: 8, reasons: ['8m'] }],
    ]),
  );

  const awards = store.listHuddleAwards('R1');
  assert.equal(awards.length, 2);
  // Biggest first, so a page can render the top of the list without sorting.
  assert.deepEqual(
    awards.map((award) => award.userId),
    ['U1', 'U2'],
  );
  assert.equal(awards[0].points, 30);
  assert.deepEqual(awards[0].reasons, ['12m', 'rank 1', 'started the huddle']);
  assert.equal(awards[0].channelId, 'C1');
});

test('re-awarding a huddle replaces its breakdown instead of adding to it', async () => {
  const store = await createTestStore();
  // The track-again button can send the same huddle through the awarder twice. If
  // the second write merged, a re-tracked huddle would show double points.
  store.saveHuddleAwards(
    'R1',
    'C1',
    new Map([
      ['U1', { points: 30, reasons: ['12m'] }],
      ['U2', { points: 8, reasons: ['8m'] }],
    ]),
  );
  store.saveHuddleAwards('R1', 'C1', new Map([['U1', { points: 30, reasons: ['12m'] }]]));

  const awards = store.listHuddleAwards('R1');
  assert.equal(awards.length, 1, 'the person who dropped off is gone, not kept at their old total');
  assert.equal(awards[0].points, 30);
});

test('channel totals add up points and huddle time', async () => {
  const store = await createTestStore();
  store.upsertHuddle({ callId: 'R1', channelId: 'C1', startedAt: 1000, endedAt: 4600 });
  store.upsertHuddle({ callId: 'R2', channelId: 'C1', startedAt: 1000, endedAt: 2800 });
  store.saveHuddleAwards('R1', 'C1', new Map([['U1', { points: 10, reasons: ['10m'] }]]));
  store.saveHuddleAwards('R2', 'C1', new Map([['U1', { points: 5, reasons: ['5m'] }]]));

  const totals = store.listChannelAwardTotals('C1');
  assert.equal(totals.points, 15);
  assert.equal(totals.seconds, 3600 + 1800);
});

test('a channel nobody has classified counts as private', async () => {
  const store = await createTestStore();
  store.upsertHuddleChannel({ channelId: 'Cunknown' });

  // -1 rather than 0 on purpose. Slack's lookup can fail, and a channel we know
  // nothing about must never be published, so anything but a confirmed 0 is
  // treated as private.
  assert.equal(store.getHuddleChannel('Cunknown').is_private, -1);
  const [channel] = store.listTrackedHuddleChannels().filter((row) => row.channel_id === 'Cunknown');
  assert.equal(channel.isPrivate, -1);
  assert.notEqual(channel.isPrivate, 0, 'unknown is never the same as public');
});

test('recording a channel privacy only touches that column', async () => {
  const store = await createTestStore();
  store.upsertHuddleChannel({ channelId: 'C1', isPrivate: false, condensedReview: true });

  // A partial update that omitted is_private would reset a private channel back
  // to unknown-public and could publish it.
  store.upsertHuddleChannel({ channelId: 'C1', condensedReview: false });
  let channel = store.getHuddleChannel('C1');
  assert.equal(channel.is_private, 0, 'privacy survives an update that did not mention it');
  assert.equal(channel.condensed_review, 0);

  store.upsertHuddleChannel({ channelId: 'C1', condensedReview: true });
  assert.equal(store.getHuddleChannel('C1').condensed_review, 1);

  store.upsertHuddleChannel({ channelId: 'C1', isPrivate: true });
  channel = store.getHuddleChannel('C1');
  assert.equal(channel.is_private, 1, 'privacy can still be corrected');
  assert.equal(channel.condensed_review, 1, 'and the condensed setting is left alone');
});
