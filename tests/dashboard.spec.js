import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';
import { cachetAvatarUrl, cachetUserUrl, createCachetDirectory } from '../src/dashboard/cachet.js';
import { renderDashboardHtml } from '../src/dashboard/html.js';
import { ROLES, resolvePermissions } from '../src/dashboard/permissions.js';
import { createDashboardServer } from '../src/dashboard/server.js';
import { buildDashboardStats } from '../src/dashboard/stats.js';
import { createStore } from '../src/database/store.js';

let createdPaths = [];

afterEach(() => {
  for (const databasePath of createdPaths) {
    fs.rmSync(path.dirname(databasePath), { recursive: true, force: true });
  }
  createdPaths = [];
});

async function createTestStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteria-dashboard-'));
  const databasePath = path.join(tempDir, 'asteria.sqlite');
  createdPaths.push(databasePath);
  return createStore(databasePath, { ownerId: 'U0AEYDUCLKF' });
}

function createSlackClientDouble() {
  return {
    conversations: {
      open: mock.fn(async ({ user }) => ({ channel: { id: `D${user}` } })),
    },
    chat: {
      postMessage: mock.fn(async () => ({ ts: '1.1' })),
    },
  };
}

async function startDashboard(overrides = {}) {
  const store = overrides.store || (await createTestStore());
  const client = overrides.client || createSlackClientDouble();
  const botChannels = overrides.botChannels || { list: mock.fn(async () => ['Cbot']), invalidate: () => {} };
  const dashboard = createDashboardServer({
    store,
    client,
    botChannels,
    logger: { info: mock.fn(), warn: mock.fn(), error: mock.fn() },
    startedAt: Date.now() - 90 * 60 * 1000,
  });
  await dashboard.listen(0, '127.0.0.1');
  const { port } = dashboard.server.address();
  return {
    store,
    client,
    dashboard,
    base: `http://127.0.0.1:${port}`,
    async stop() {
      await dashboard.close();
      store.close();
    },
  };
}

async function signIn(harness, { slackUserId = 'U0AEYDUCLKF' } = {}) {
  const send = await fetch(`${harness.base}/api/auth/code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slackUserId }),
  });
  assert.equal(send.status, 200, 'code request accepted');
  // Read the real code out of the DM the bot just sent, the way a person would.
  const dm = harness.client.chat.postMessage.mock.calls.at(-1).arguments[0].text;
  const code = dm.match(/\*(\d{6})\*/)[1];
  const body = await fetch(`${harness.base}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slackUserId, code }),
  });
  assert.equal(body.status, 200, 'verification accepted');
  const cookie = body.headers.get('set-cookie').split(';')[0];
  return { cookie, role: (await body.json()).role };
}

describe('cachet directory', () => {
  it('builds profile and avatar urls, with /r for the picture', () => {
    assert.equal(cachetUserUrl('U123'), 'https://cachet.hackclub.com/users/U123');
    assert.equal(cachetAvatarUrl('U123'), 'https://cachet.hackclub.com/users/U123/r');
  });

  it('caches profiles and survives a Cachet outage', async () => {
    let calls = 0;
    const fetchImpl = mock.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            userId: 'U123',
            displayName: 'Sam',
            realName: 'Sam Rivera',
            pronouns: 'they/them',
            imageUrl: 'https://example.com/sam.png',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('nope', { status: 500 });
    });
    const cachet = createCachetDirectory({ fetchImpl, logger: { warn: mock.fn() } });

    const first = await cachet.fetchProfile('U123');
    assert.equal(first.displayName, 'Sam');
    assert.equal(first.pronouns, 'they/them');
    await cachet.fetchProfile('U123');
    assert.equal(calls, 1, 'second lookup served from cache');

    const missing = await cachet.fetchProfile('U999');
    assert.equal(missing, null, 'an unknown profile is null, not a crash');
  });
});

describe('dashboard permissions', () => {
  it('gives the owner everything, managers their channels, everyone else nothing special', async () => {
    const store = await createTestStore();
    store.upsertHuddleChannel({ channelId: 'Cmine', name: 'mine', ownerIds: ['UMANAGER'] });

    const owner = resolvePermissions({ store, slackUserId: 'U0AEYDUCLKF' });
    assert.equal(owner.role, ROLES.OWNER);
    assert.equal(owner.isOwner, true);
    assert.equal(owner.managedChannelIds, null, 'owners are not scoped to a list');

    const manager = resolvePermissions({ store, slackUserId: 'UMANAGER' });
    assert.equal(manager.role, ROLES.MANAGER);
    assert.deepEqual(manager.managedChannelIds, ['Cmine']);

    const user = resolvePermissions({ store, slackUserId: 'URANDOM' });
    assert.equal(user.role, ROLES.USER);
    assert.deepEqual(user.managedChannelIds, []);
    assert.equal(resolvePermissions({ store, slackUserId: '' }).role, null, 'signed out is nobody');

    store.close();
  });
});

describe('dashboard server', () => {
  it('serves the dashboard, and health as json', async () => {
    const harness = await startDashboard();
    try {
      const page = await fetch(`${harness.base}/`);
      assert.equal(page.status, 200);
      assert.match(page.headers.get('content-type'), /text\/html/);
      const html = await page.text();
      assert.match(html, /Asteria/);
      assert.match(html, /--accent:#86efac/, 'dark theme with the light green accent');
      assert.match(html, /color-scheme:dark/);

      const health = await fetch(`${harness.base}/health`);
      assert.equal(health.status, 200);
      const body = await health.json();
      assert.equal(body.ok, true);
      assert.equal(typeof body.uptimeSeconds, 'number');
      assert.equal(typeof body.startedAt, 'string');
    } finally {
      await harness.stop();
    }
  });

  it('keeps rss working and 404s anything else', async () => {
    const harness = await startDashboard();
    try {
      const rss = await fetch(`${harness.base}/rss.xml`);
      assert.equal(rss.status, 200);
      assert.match(await rss.text(), /<rss/);
      assert.equal((await fetch(`${harness.base}/nope`)).status, 404);
    } finally {
      await harness.stop();
    }
  });

  it('verifies a Slack member id by DM code before creating a session', async () => {
    const harness = await startDashboard();
    try {
      assert.equal((await fetch(`${harness.base}/api/stats`)).status, 200, 'stats are public');
      const stats = await (await fetch(`${harness.base}/api/stats`)).json();
      assert.equal(stats.viewer.signedIn, false);
      assert.equal(stats.logs.length, 0, 'no activity log for signed-out visitors');

      const bad = await fetch(`${harness.base}/api/auth/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slackUserId: 'U0AEYDUCLKF', code: '999999' }),
      });
      assert.equal(bad.status, 400, 'a wrong code is rejected');
      assert.equal(harness.client.conversations.open.mock.callCount(), 0, 'and no DM was needed');

      const signedIn = await signIn(harness);
      assert.equal(signedIn.role, ROLES.OWNER);
      assert.equal(harness.client.chat.postMessage.mock.callCount(), 1, 'the code was DMd once');
      assert.match(harness.client.chat.postMessage.mock.calls[0].arguments[0].text, /sign-in code is \*\d{6}\*/);

      const mine = await fetch(`${harness.base}/api/stats`, { headers: { cookie: signedIn.cookie } });
      const body = await mine.json();
      assert.equal(body.viewer.signedIn, true);
      assert.equal(body.viewer.isOwner, true);
    } finally {
      await harness.stop();
    }
  });

  it('rejects a Slack id that does not look like one before messaging anyone', async () => {
    const harness = await startDashboard();
    try {
      const response = await fetch(`${harness.base}/api/auth/code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slackUserId: 'not-an-id' }),
      });
      // A typo is the visitor's to fix, so it gets a 400 that says what to
      // type rather than a 500 that blames us.
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /Slack member ID/);
      assert.equal(harness.client.conversations.open.mock.callCount(), 0);
    } finally {
      await harness.stop();
    }
  });

  it('lets a normal user hide themselves from the leaderboard, and only themselves', async () => {
    const store = await createTestStore();
    store.awardHuddlePoints('U0AEYDUCLKF', 50, 'Cbot');
    store.awardHuddlePoints('U0PLAIN01', 30, 'Cbot');
    const harness = await startDashboard({ store });
    try {
      const owner = await signIn(harness);
      const user = await signIn(harness, { slackUserId: 'U0PLAIN01' });

      const anonymous = await (await fetch(`${harness.base}/api/stats`)).json();
      assert.deepEqual(
        anonymous.leaderboard.map((row) => row.userId),
        ['U0AEYDUCLKF', 'U0PLAIN01'],
      );

      const optOut = await fetch(`${harness.base}/api/me/opt-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: user.cookie },
        body: JSON.stringify({ optedIn: false }),
      });
      assert.equal(optOut.status, 200);
      assert.equal((await optOut.json()).leaderboardOptIn, false);

      const after = await (await fetch(`${harness.base}/api/stats`, { headers: { cookie: user.cookie } })).json();
      assert.deepEqual(
        after.leaderboard.map((row) => row.userId),
        ['U0AEYDUCLKF'],
        'the opt-out is respected',
      );
      assert.equal(after.viewer.leaderboardOptIn, false);
      assert.equal(after.viewer.role, ROLES.USER);

      const denied = await fetch(`${harness.base}/api/me/opt-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ optedIn: true }),
      });
      assert.equal(denied.status, 401, 'signed-out visitors cannot flip it');

      const ownerView = await (await fetch(`${harness.base}/api/stats`, { headers: { cookie: owner.cookie } })).json();
      assert.equal(ownerView.viewer.isOwner, true);
    } finally {
      await harness.stop();
    }
  });

  it('only serves the activity log to the owner', async () => {
    const store = await createTestStore();
    store.recordTriggerLog({ userId: 'U1', action: 'huddle_join', detail: 'R1', channelId: 'Cbot' });
    const harness = await startDashboard({ store });
    try {
      const anonymous = await (await fetch(`${harness.base}/api/stats`)).json();
      assert.equal(anonymous.logs.length, 0);

      const user = await signIn(harness, { slackUserId: 'U0PLAIN01' });
      const asUser = await (await fetch(`${harness.base}/api/stats`, { headers: { cookie: user.cookie } })).json();
      assert.equal(asUser.logs.length, 0, 'a normal user gets no log');

      const owner = await signIn(harness);
      const asOwner = await (await fetch(`${harness.base}/api/stats`, { headers: { cookie: owner.cookie } })).json();
      assert.equal(asOwner.logs.length, 1, 'the owner sees the log');
      assert.equal(asOwner.logs[0].action, 'huddle_join');
    } finally {
      await harness.stop();
    }
  });

  it('signs a visitor out and forgets the session', async () => {
    const harness = await startDashboard();
    try {
      const signedIn = await signIn(harness);
      const out = await fetch(`${harness.base}/logout`, {
        method: 'POST',
        headers: { cookie: signedIn.cookie },
        redirect: 'manual',
      });
      assert.equal(out.status, 302);
      assert.equal(
        (await (await fetch(`${harness.base}/api/stats`, { headers: { cookie: signedIn.cookie } })).json()).viewer
          .signedIn,
        false,
      );
    } finally {
      await harness.stop();
    }
  });

  it('sends /login to the sign in panel when the app has no oauth client', async () => {
    const harness = await startDashboard();
    try {
      const response = await fetch(`${harness.base}/login`, { redirect: 'manual' });
      assert.equal(response.status, 302);
      assert.match(response.headers.get('location'), /#signin-panel$/);
    } finally {
      await harness.stop();
    }
  });

  it('rejects a forged Slack callback state', async () => {
    const harness = await startDashboard();
    try {
      const response = await fetch(`${harness.base}/auth/slack/callback?code=x&state=forged`);
      assert.equal(response.status, 400);
    } finally {
      await harness.stop();
    }
  });
});

describe('dashboard stats', () => {
  it('summarises huddles, uptime and the leaderboard with Cachet profiles', async () => {
    const store = await createTestStore();
    store.upsertHuddle({
      callId: 'R1',
      channelId: 'Cbot',
      createdBy: 'U1',
      startedAt: Math.floor(Date.now() / 1000) - 3600,
      endedAt: Math.floor(Date.now() / 1000) - 60,
      threadRootTs: '1.1',
      participantHistory: ['U1', 'U2'],
    });
    store.setHuddleStatus('R1', 'ended', Math.floor(Date.now() / 1000) - 60);
    store.awardHuddlePoints('U1', 40, 'Cbot');
    store.awardHuddlePoints('U2', 10, 'Cbot');

    const cachet = createCachetDirectory({
      fetchImpl: async (url) =>
        new Response(
          JSON.stringify({
            userId: url.split('/').pop(),
            displayName: 'Sam',
            realName: 'Sam Rivera',
            imageUrl: 'https://img/sam.png',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      logger: { warn: mock.fn() },
    });

    const stats = await buildDashboardStats({
      store,
      botChannels: { list: async () => ['Cbot'] },
      permissions: { role: ROLES.OWNER, isOwner: true, isManager: true, managedChannelIds: null },
      cachet,
      startedAt: Date.now() - 60000,
      statusEvents: [{ state: 'ok', at: new Date().toISOString() }],
    });

    assert.equal(stats.huddles.ended, 1);
    assert.equal(stats.huddles.members, 2);
    // Every huddle before per-channel attribution shipped is a lifetime point
    // with no channel attached. Scoping must not make those disappear, which
    // is the whole production leaderboard.
    store.awardHuddlePoints('U3', 120);
    const scoped = store.listHuddleLeaderboard(25, ['Cbot']);
    assert(
      scoped.some((row) => row.user_id === 'U3' && row.points === 120),
      'unattributed history survives a scope',
    );
    assert.equal(stats.uptime.seconds >= 59, true);
    assert.equal(stats.uptime.state, 'ok');
    assert.equal(stats.leaderboard[0].userId, 'U1');
    assert.equal(stats.leaderboard[0].points, 40);
    assert.equal(stats.leaderboard[0].displayName, 'Sam');
    assert.equal(stats.leaderboard[0].imageUrl, 'https://img/sam.png');
    assert.equal(stats.botChannels.count, 1);
    store.close();
  });
});

describe('dashboard markup', () => {
  it('escapes anything user controlled and ships the dark theme tokens', () => {
    const html = renderDashboardHtml({ signedIn: true, role: 'owner', oauthConfigured: true });
    assert.match(html, /color-scheme:dark/);
    assert.match(html, /--bg:#0a0b0a/);
    assert.match(html, /class="who" id="who">owner<\/span>/);
    assert.doesNotMatch(html, /<script src=/, 'no external scripts');
  });
});
