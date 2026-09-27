import { ROLES } from './permissions.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everything the dashboard renders, already scoped to what the viewer is allowed
 * to see. Owners get the lot, channel managers only their channels, everyone else
 * aggregate numbers and their own switch.
 */
export async function buildDashboardStats({ store, botChannels, permissions, cachet, startedAt, statusEvents = [] }) {
  const isOwner = permissions.role === ROLES.OWNER;
  const isManager = permissions.role === ROLES.MANAGER;
  const channelIds = await botChannels.list();
  const now = Date.now();

  const allHuddles = store.listHuddles();
  const channels = store.listTrackedHuddleChannels();
  const visibleHuddles =
    isOwner || !isManager ? allHuddles : allHuddles.filter((h) => permissions.managedChannelIds.includes(h.channel_id));

  const active = visibleHuddles.filter((h) => h.status === 'active');
  const ended = visibleHuddles.filter((h) => h.status === 'ended');
  const optedOut = visibleHuddles.filter((h) => h.status === 'opted_out');
  const last24h = ended.filter((h) => now - toMillis(h.ended_at) < DAY_MS);
  const durations = ended
    .map((h) => (toMillis(h.ended_at) - toMillis(h.started_at)) / 1000)
    .filter((seconds) => Number.isFinite(seconds) && seconds > 0);
  const membersSeen = new Set();
  for (const huddle of visibleHuddles) {
    for (const member of parseJsonArray(huddle.participant_json)) {
      membersSeen.add(member);
    }
  }

  const leaderboardRows = store.listHuddleLeaderboard(25, channelIds);
  const leaderboard = await withProfiles({
    rows: leaderboardRows.map((row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      points: Number(row.points) || 0,
    })),
    cachet,
    store,
  });

  const logs = isOwner ? store.listTriggerLog(25, channelIds) : [];

  const incidents = statusEvents
    .filter((event) => event.state !== 'ok' && event.state !== 'operational')
    .slice(-6)
    .reverse()
    .map((event) => ({ state: event.state, at: event.at, detail: event.detail || '' }));

  return {
    generatedAt: new Date(now).toISOString(),
    viewer: {
      role: permissions.role,
      isOwner,
      isManager,
      managedChannelIds: permissions.managedChannelIds,
    },
    uptime: {
      startedAt: new Date(startedAt).toISOString(),
      seconds: Math.max(0, Math.round((now - startedAt) / 1000)),
      state: statusEvents.at(-1)?.state || 'unknown',
      lastEvent: statusEvents.at(-1) || null,
      incidents,
    },
    huddles: {
      total: visibleHuddles.length,
      active: active.length,
      ended: ended.length,
      optedOut: optedOut.length,
      last24h: last24h.length,
      longestSeconds: durations.length ? Math.round(Math.max(...durations)) : 0,
      averageSeconds: durations.length
        ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length)
        : 0,
      members: membersSeen.size,
    },
    channels: channels.map((channel) => ({
      id: channel.channel_id,
      name: channel.name || channel.channel_id,
      enabled: !!channel.enabled,
      autoReplies: !!channel.auto_replies,
      restrictTriggers: !!channel.restrict_triggers,
      paused: Number(channel.paused_until) > Math.floor(now / 1000),
      inBot: channelIds.includes(channel.channel_id),
      ownerCount: parseJsonArray(channel.owner_ids).length,
      managed: isOwner || permissions.managedChannelIds?.includes(channel.channel_id) || false,
    })),
    botChannels: { count: channelIds.length, ids: isOwner ? channelIds : [] },
    leaderboard,
    logs,
  };
}

/** Leaderboard rows with Cachet profiles attached and opt-out honoured. */
async function withProfiles({ rows, cachet, store }) {
  const visible = rows.filter((row) => (store.isLeaderboardOptIn ? store.isLeaderboardOptIn(row.userId) : true));
  const profiles = cachet ? await cachet.list(visible.map((row) => row.userId)) : {};
  return visible.map((row) => {
    const profile = profiles[row.userId] || {};
    return {
      ...row,
      displayName: profile.displayName || profile.realName || row.userId,
      realName: profile.realName || '',
      pronouns: profile.pronouns || '',
      imageUrl: profile.imageUrl || (cachet ? cachet.avatarUrl(row.userId) : ''),
      profileUrl: cachet ? cachet.profileUrl(row.userId) : '',
    };
  });
}

function toMillis(value) {
  if (!value) {
    return 0;
  }
  if (typeof value === 'number') {
    return value < 1e12 ? value * 1000 : value;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw !== 'string' || raw.trim() === '') {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
