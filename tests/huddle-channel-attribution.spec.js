import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createStore } from '../src/database/store.js';

const created = [];
let store;

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-chan-'));
  const p = path.join(dir, 'asteria.sqlite');
  created.push(p);
  store = await createStore(p);
});

after(() => {
  for (const p of created) fs.rmSync(p, { force: true });
});

describe('huddle channel attribution', () => {
  it('keeps a known channel when a later event carries none', () => {
    // The thread message is what tells us the channel, and it usually arrives
    // after the join event that creates the row.
    store.upsertHuddle({ callId: 'R1', startedAt: 100, channelId: 'CGOOD' });
    assert.equal(store.getHuddle('R1').channel_id, 'CGOOD');

    // A later event with no channel must not erase it.
    store.upsertHuddle({ callId: 'R1', startedAt: 100, channelId: '' });
    assert.equal(store.getHuddle('R1').channel_id, 'CGOOD', 'empty must not wipe a known channel');
  });

  it('overwrites when a different real channel shows up', () => {
    store.upsertHuddle({ callId: 'R2', startedAt: 100, channelId: 'CA' });
    store.upsertHuddle({ callId: 'R2', startedAt: 100, channelId: 'CB' });
    assert.equal(store.getHuddle('R2').channel_id, 'CB');
  });

  it('still records a channel when the first event has none', () => {
    store.upsertHuddle({ callId: 'R3', startedAt: 100, channelId: '' });
    assert.equal(store.getHuddle('R3').channel_id, '');
    store.upsertHuddle({ callId: 'R3', startedAt: 100, channelId: 'CLATER' });
    assert.equal(store.getHuddle('R3').channel_id, 'CLATER', 'late attribution must land');
  });
});
