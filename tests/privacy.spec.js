import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { canSeeChannelDetail, channelLabel, isChannelPublic } from '../src/dashboard/privacy.js';
import { buildDashboardStats } from '../src/dashboard/stats.js';
import { createStore } from '../src/database/store.js';

const PUBLIC = 'Cpublic';
const PRIVATE = 'Cprivate';
const UNKNOWN = 'Cunknown';
const START = 1_700_000_000;
const END = START + 3600;

const ANON = { role: null, isOwner: false, isManager: false, managedChannelIds: [] };
const USER = { role: 'user', isOwner: false, isManager: false, managedChannelIds: [] };
const OWNER = { role: 'owner', isOwner: true, isManager: false, managedChannelIds: [] };
const MANAGER = { role: 'manager', isOwner: false, isManager: true, managedChannelIds: [PUBLIC] };

describe('channel privacy rules', () => {
  test('only a positive public answer counts as public', () => {
    assert.equal(isChannelPublic(0), true);
    // -1 means "never checked", and 1 means private. Neither may be read as
    // public, because guessing wrong publishes a private channel's detail.
    assert.equal(isChannelPublic(-1), false);
    assert.equal(isChannelPublic(1), false);
    assert.equal(isChannelPublic(undefined), false);
    assert.equal(isChannelPublic(null), false);
  });

  test('the name is always shown, because the huddles are the secret', () => {
    assert.equal(channelLabel({ name: 'general', channelId: 'C1' }), 'general');
    assert.equal(channelLabel({ name: 'secret-plans', channelId: 'C2' }), 'secret-plans');
    assert.equal(channelLabel({ name: '', channelId: 'C3' }), 'C3', 'falls back to the id, never to nothing');
  });

  test('public channel detail is public', () => {
    for (const viewer of [ANON, USER, OWNER]) {
      assert.equal(
        canSeeChannelDetail({
          isPrivate: false,
          isOwner: viewer.isOwner,
          isManager: viewer.isManager,
          permissions: viewer,
          channelId: PUBLIC,
        }),
        true,
      );
    }
  });

  test('private channel detail needs membership, ownership or the manager role', () => {
    const base = { isPrivate: true, channelId: PRIVATE };
    assert.equal(canSeeChannelDetail({ ...base, permissions: ANON }), false, 'anonymous cannot see it');
    assert.equal(canSeeChannelDetail({ ...base, permissions: USER }), false, 'signed in is not the same as in it');
    assert.equal(canSeeChannelDetail({ ...base, permissions: USER, memberOfChannel: true }), true, 'a member can');
    assert.equal(canSeeChannelDetail({ ...base, isOwner: true, permissions: OWNER }), true, 'the owner can');
    assert.equal(
      canSeeChannelDetail({ ...base, isManager: true, permissions: MANAGER }),
      false,
      'managing a different channel is not enough',
    );
    assert.equal(
      canSeeChannelDetail({
        ...base,
        isManager: true,
        permissions: { ...MANAGER, managedChannelIds: [PRIVATE] },
      }),
      true,
      'the channel manager can',
    );
  });
});

describe('the public dashboard and private channels', () => {
  const created = [];
  let store;
  let slackPrivacyAsked;
  let memberChecked;

  before(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-privacy-'));
    created.push(dir);
    store = await createStore(path.join(dir, 'asteria.sqlite'));
    seed();
  });

  after(() => {
    // One store for the whole suite: sql.js holds the database in memory, so
    // closing it between tests leaves the next one reading a dead handle.
    store.close();
    for (const dir of created) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Three channels, one of each privacy state, each with a huddle and a manager.
   */
  function seed() {
    for (const [channelId, name, callId] of [
      [PUBLIC, 'general', 'Rpublic1'],
      [PRIVATE, 'secret-plans', 'Rprivate1'],
      [UNKNOWN, 'never-asked', 'Runknown1'],
    ]) {
      store.upsertHuddle({
        callId,
        channelId,
        channelName: name,
        createdBy: 'U1',
        startedAt: START,
        endedAt: END,
        status: 'ended',
      });
    }
    for (const [channelId, ownerId] of [
      [PUBLIC, 'U1'],
      [PRIVATE, 'U2'],
      [UNKNOWN, 'U3'],
    ]) {
      store.upsertHuddleChannel({
        channelId,
        name: { [PUBLIC]: 'general', [PRIVATE]: 'secret-plans', [UNKNOWN]: 'never-asked' }[channelId],
        ownerIds: [ownerId],
        isPrivate: 0,
      });
      // Force the tri-state the way the sync would.
      store.setHuddleChannelPrivacy(channelId, channelId === PUBLIC ? 0 : channelId === PRIVATE ? 1 : -1);
    }
    store.awardHuddlePoints('U1', 40, PUBLIC);
  }

  function build(permissions, { viewerId = '', member = false } = {}) {
    slackPrivacyAsked = [];
    memberChecked = [];
    return buildDashboardStats({
      store,
      botChannels: { list: async () => [PUBLIC, PRIVATE, UNKNOWN] },
      permissions,
      viewerId,
      startedAt: Date.now(),
      statusEvents: [{ state: 'ok', at: new Date().toISOString() }],
      slack: {
        channelPrivacy: async (channelId) => {
          slackPrivacyAsked.push(channelId);
          return channelId === PRIVATE ? 1 : 0;
        },
        isMember: async (channelId, userId) => {
          memberChecked.push([channelId, userId]);
          return member;
        },
      },
    });
  }

  test('anonymous sees public channels in full and private ones by name only', async () => {
    const stats = await build(ANON);

    const publicCard = stats.channels.find((channel) => channel.id === PUBLIC);
    assert.equal(publicCard.name, 'general', 'a public channel is named publicly');
    assert.equal(publicCard.locked, false);
    assert.equal(publicCard.stats.total, 1, 'and its huddle data is public');
    assert.equal(publicCard.managers.length, 1, 'including who manages it');

    const privateCard = stats.channels.find((channel) => channel.id === PRIVATE);
    assert.equal(privateCard.name, 'secret-plans', 'the name is public');
    assert.equal(privateCard.locked, true, 'but the detail is not');
    assert.equal(privateCard.stats, null, 'no huddle numbers');
    assert.deepEqual(privateCard.managers, [], 'and no people');
    assert.equal(privateCard.ownerCount, 0);
    assert.equal(privateCard.flaron.members, null, 'not even a headcount');
    assert.equal(privateCard.enabled, null, 'not even whether tracking is on');
  });

  test('the leaderboard is public and named', async () => {
    const stats = await build(ANON);
    assert(stats.leaderboard.length > 0);
    for (const row of stats.leaderboard) {
      assert.ok(row.displayName, 'a public leaderboard names people');
      assert.equal(row.key, row.userId, 'and keeps the row key');
      assert.ok(!row.anonymised, 'there is no anonymised mode any more');
    }
  });

  test('a signed in member of the private channel sees its detail', async () => {
    const stats = await build(USER, { viewerId: 'U2', member: true });
    const privateCard = stats.channels.find((channel) => channel.id === PRIVATE);
    assert.equal(privateCard.locked, false);
    assert.equal(privateCard.stats.total, 1);
    assert.equal(privateCard.managers.length, 1);
    assert.deepEqual(memberChecked, [[PRIVATE, 'U2']], 'only the private channel is checked');
  });

  test('a signed in non-member still cannot see it', async () => {
    const stats = await build(USER, { viewerId: 'U9', member: false });
    const privateCard = stats.channels.find((channel) => channel.id === PRIVATE);
    assert.equal(privateCard.locked, true);
    assert.equal(privateCard.stats, null);
  });

  test('the owner sees every channel in full', async () => {
    const stats = await build(OWNER, { viewerId: 'U0AEYDUCLKF' });
    for (const channel of stats.channels) {
      assert.equal(channel.locked, false, `${channel.name} is visible to the owner`);
      assert.ok(channel.stats, 'with its numbers');
    }
    assert.deepEqual(memberChecked, [], 'the owner does not need a membership lookup');
  });

  test('Slack is asked once per unchecked channel and the answer is remembered', async () => {
    // Put both back to unknown: the earlier tests already resolved them, and
    // this test is about the ask happening exactly once and then sticking.
    store.setHuddleChannelPrivacy(PRIVATE, -1);
    store.setHuddleChannelPrivacy(UNKNOWN, -1);
    await build(ANON);
    assert.deepEqual(
      slackPrivacyAsked.sort(),
      [PRIVATE, UNKNOWN].sort(),
      'a channel Slack already answered for is not asked again',
    );
    assert.equal(store.getHuddleChannel(PRIVATE).is_private, 1);
    assert.equal(store.getHuddleChannel(UNKNOWN).is_private, 0, 'Slack said it was public, so it is now known');
  });
});
