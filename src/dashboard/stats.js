import { ROLES } from './permissions.js';
import { canSeeChannelDetail, channelLabel } from './privacy.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everything the dashboard renders, already scoped to what the viewer is allowed
 * to see. Owners get the lot, channel managers only their channels, everyone else
 * aggregate numbers and their own switch.
 */
export async function buildDashboardStats({
  store,
  botChannels,
  permissions,
  cachet,
  flaron,
  slack,
  startedAt,
  statusEvents = [],
  viewerId = '',
}) {
  const isOwner = permissions.role === ROLES.OWNER;
  const isManager = permissions.role === ROLES.MANAGER;
  const channelIds = await botChannels.list();
  const now = Date.now();
  // Every number, card and huddle on the dashboard comes from channels the bot is
  // actually in. A channel it cannot see could not have tracked a huddle, so
  // counting it would inflate the aggregates with data that can never exist.
  const botChannelSet = new Set(channelIds);

  const allHuddles = store.listHuddles().filter((h) => botChannelSet.has(h.channel_id));
  const trackedChannels = store.listTrackedHuddleChannels().filter((c) => botChannelSet.has(c.channel_id));
  // Every channel the bot is in should have a card, not just the ones that have
  // already seen a huddle or were configured by hand. Otherwise a channel the bot
  // was invited to (waveland, say) is invisible until somebody happens to huddle
  // there, which reads as "the bot is broken". Only signed in viewers get the
  // extra rows: they are already in the workspace, while the public page should
  // not publish the existence of channels it has no history for.
  const trackedChannelIds = new Set(trackedChannels.map((channel) => channel.channel_id));
  const canSeeEmptyChannels = isOwner || isManager || permissions.role != null;
  const untrackedChannels = canSeeEmptyChannels
    ? channelIds
        .filter((id) => !trackedChannelIds.has(id))
        .map((id) => ({
          channel_id: id,
          name: '',
          enabled: 1,
          auto_replies: 1,
          restrict_triggers: 0,
          owner_ids: '[]',
          paused_until: 0,
          is_private: -1,
          condensed_review: 0,
          configured: false,
        }))
    : [];
  const channels = [...trackedChannels, ...untrackedChannels];
  const visibleHuddles =
    isOwner || !isManager ? allHuddles : allHuddles.filter((h) => permissions.managedChannelIds.includes(h.channel_id));

  const active = visibleHuddles.filter((h) => h.status === 'active');
  const ended = visibleHuddles.filter((h) => h.status === 'ended');
  const optedOut = visibleHuddles.filter((h) => h.status === 'opted_out');
  const last24h = ended.filter((h) => now - toMillis(h.ended_at) < DAY_MS);
  const durations = ended
    .map((h) => (toMillis(h.ended_at) - toMillis(h.started_at)) / 1000)
    // 43200 is the old stale sweep's "gave up after twelve hours" placeholder.
    // Rows that still carry it have no usable end time, and one of them was
    // making the site claim a twelve hour huddle.
    .filter((seconds) => Number.isFinite(seconds) && seconds > 0 && Math.round(seconds) !== 43_200);
  // participant_json is only filled on a few old rows, so counting it said
  // "12 people seen" next to a leaderboard with 251. The member table is the
  // real record.
  const membersSeen = new Set();
  for (const huddle of visibleHuddles) {
    for (const member of parseJsonArray(huddle.participant_json)) {
      membersSeen.add(member);
    }
    for (const member of store.listHuddleMembers(huddle.call_id)) {
      if (member.user_id) {
        membersSeen.add(member.user_id);
      }
    }
  }

  // The board counts a channel only when it is both tracked and one the bot is
  // actually in. Passing the bot's whole membership list is what put people from
  // untracked huddles on the board; tracked alone would count channels the bot
  // cannot see, which could not have scored anyway.
  //
  // This stays on `trackedChannels` rather than every card above: a card with no
  // settings row and no huddle history has no attributed points to count, and an
  // old award row must not sneak in through a channel nobody opted into.
  const scopeChannelIds = trackedChannels
    .map((channel) => channel.channel_id)
    .filter((id) => id && channelIds.includes(id));
  const leaderboardRows = store.listHuddleLeaderboard(25, scopeChannelIds);
  const rawLeaderboard = await withProfiles({
    rows: leaderboardRows.map((row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      points: Number(row.points) || 0,
    })),
    cachet,
    store,
  });

  // The board is public. Every row is named, subject to the person's own
  // leaderboard opt-out, which is applied in withProfiles. Keeping the name off
  // an anonymous view made the public page useless and was not what the product
  // wanted: the points are the point, and they are already attributed to a
  // Slack display name the workspace can see everywhere else.
  const leaderboard = rawLeaderboard.map((row) => ({ ...row, key: row.userId }));

  const logs = isOwner ? store.listTriggerLog(25, channelIds) : [];

  const incidents = statusEvents
    .filter((event) => event.state !== 'ok' && event.state !== 'operational')
    .slice(-6)
    .reverse()
    .map((event) => ({ state: event.state, at: event.at, detail: event.detail || '' }));

  // A channel can be saved with a blank name, and huddle rows only carry a name
  // when something recorded one, so ask Slack for the ones we are missing and
  // remember the answer instead of rendering a raw id forever.
  // is_private is tri-state and -1 means "never checked". Nothing else in the
  // app wrote it, so every channel sat at unknown forever and the dashboard
  // published all of them by accident. Ask Slack once per channel that is still
  // unknown, remember the answer, and let the privacy rules below do the rest.
  if (slack?.channelPrivacy) {
    await Promise.all(
      channels
        .filter((channel) => Number(channel.is_private) === -1)
        .map(async (channel) => {
          const isPrivate = await slack.channelPrivacy(channel.channel_id).catch(() => null);
          if (isPrivate === null) {
            // A failed lookup leaves it at -1, which still reads as private.
            return;
          }
          channel.is_private = isPrivate;
          // Only remember the answer for a channel that already has a settings
          // row. Writing one here would quietly turn every channel the bot is in
          // into a "tracked" channel just because somebody loaded the page.
          if (channel.configured !== false && typeof store.setHuddleChannelPrivacy === 'function') {
            store.setHuddleChannelPrivacy(channel.channel_id, isPrivate);
          }
        }),
    );
  }

  const unnamed = channels.filter((channel) => !channel.name).map((channel) => channel.channel_id);
  if (unnamed.length && typeof botChannels.names === 'function') {
    const resolved = await botChannels.names(unnamed);
    for (const [channelId, name] of Object.entries(resolved)) {
      const match = channels.find((channel) => channel.channel_id === channelId);
      if (match) {
        match.name = name;
      }
      if (match?.configured !== false) {
        store.setHuddleChannelName?.(channelId, name);
      }
    }
  }

  // Flaron knows who runs a channel and how big it is. It refuses to describe a
  // private channel, so Slack covers the headcount there and we record which
  // source answered.
  const flaronRecords = flaron ? await flaron.list(channels.map((c) => c.channel_id)) : {};
  const slackSizes = new Map();
  if (slack?.channelSize) {
    await Promise.all(
      channels
        .filter((channel) => flaronRecords[channel.channel_id]?.members == null)
        .map(async (channel) => {
          const size = await slack.channelSize(channel.channel_id).catch(() => null);
          if (Number.isFinite(size)) {
            slackSizes.set(channel.channel_id, size);
          }
        }),
    );
  }

  // A channel manager gets a CM tag on the board, and a card in the channel
  // popup with their picture and their standing. Leaderboard profiles go through
  // withProfiles, which drops anyone who opted out of the board; a manager is
  // named by Flaron as running a channel, which is not the same as being ranked,
  // so they are looked up directly.
  //
  // The owner list lives in `huddle_channels.owner_ids` and is the single source
  // of truth shared with the App Home settings block, so a CM added or removed
  // there shows up here unchanged. Flaron only seeds a channel that has no
  // owners at all, with the creator Flaron already made the owner of, and
  // `seedHuddleChannelOwner` is a no-op once a channel has an owner, so a later
  // sync can never undo a hand edit.
  if (typeof store.seedHuddleChannelOwner === 'function') {
    for (const channel of channels) {
      const record = flaronRecords[channel.channel_id];
      const seedId = record?.creator || record?.managers?.[0] || '';
      if (seedId && store.seedHuddleChannelOwner(channel.channel_id, seedId)) {
        channel.owner_ids = JSON.stringify([seedId]);
      }
    }
  }
  const managerIds = [...new Set(channels.flatMap((channel) => parseJsonArray(channel.owner_ids)))];
  const managerProfiles = cachet && managerIds.length ? await cachet.list(managerIds) : {};
  const managerSet = new Set(managerIds);

  const channelCards = await Promise.all(
    channels.map(async (channel) => {
      const record = flaronRecords[channel.channel_id] || null;
      const fromSlack = slackSizes.has(channel.channel_id);
      const isPrivate = Number(channel.is_private) !== 0;
      const managedByViewer =
        isOwner ||
        (isManager && Array.isArray(permissions.managedChannelIds)
          ? permissions.managedChannelIds.includes(channel.channel_id)
          : false);
      // Only a private channel needs a membership lookup, and only for a signed
      // in person who is neither the owner nor one of its managers. Slack knows
      // who is in it because the bot is a member itself.
      let memberOfChannel = false;
      if (isPrivate && !managedByViewer && viewerId && typeof slack?.isMember === 'function') {
        memberOfChannel = await slack.isMember(channel.channel_id, viewerId).catch(() => false);
      }
      const detailed = canSeeChannelDetail({
        isPrivate,
        isOwner,
        isManager,
        permissions,
        channelId: channel.channel_id,
        memberOfChannel,
      });
      return {
        id: channel.channel_id,
        isPrivate: isPrivate ? 1 : 0,
        name: channelLabel({ name: channel.name, channelId: channel.channel_id }),
        inBot: channelIds.includes(channel.channel_id),
        // A private channel the viewer cannot see into publishes nothing but its
        // name. Not even whether tracking is on, or how many people manage it.
        locked: !detailed,
        enabled: detailed ? !!channel.enabled : null,
        autoReplies: detailed ? !!channel.auto_replies : null,
        restrictTriggers: detailed ? !!channel.restrict_triggers : null,
        paused: detailed ? Number(channel.paused_until) > Math.floor(now / 1000) : null,
        ownerCount: detailed ? parseJsonArray(channel.owner_ids).length : 0,
        managed: managedByViewer,
        flaron: detailed
          ? {
              known: !!record,
              source: record?.members != null ? 'flaron' : fromSlack ? 'slack' : 'none',
              members: record?.members ?? (fromSlack ? slackSizes.get(channel.channel_id) : null),
              humans: record?.humans ?? null,
              bots: record?.bots ?? null,
            }
          : { known: false, source: 'none', members: null, humans: null, bots: null },
        stats: detailed
          ? summariseHuddles(
              visibleHuddles.filter((huddle) => huddle.channel_id === channel.channel_id),
              now,
            )
          : null,
        managers: detailed
          ? parseJsonArray(channel.owner_ids)
              .map((userId) => {
                const profile = managerProfiles[userId] || {};
                const onBoard = leaderboard.find((row) => row.userId === userId);
                return {
                  userId,
                  displayName: profile.displayName || userId,
                  realName: profile.realName || '',
                  pronouns: profile.pronouns || '',
                  imageUrl: profile.imageUrl || (cachet ? cachet.avatarUrl(userId) : ''),
                  rank: onBoard?.rank ?? null,
                  points: onBoard?.points ?? null,
                };
              })
              .filter((manager) => manager.userId)
          : [],
        managerCount: detailed ? parseJsonArray(channel.owner_ids).length : 0,
      };
    }),
  );

  return {
    generatedAt: new Date(now).toISOString(),
    viewer: {
      role: permissions.role,
      isOwner,
      isManager,
      fakeAdmin: Boolean(permissions.fakeAdmin),
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
    channels: channelCards,
    botChannels: { count: channelIds.length, ids: isOwner ? channelIds : [] },
    // Slack deep links need the workspace team id, which only auth.test knows.
    teamId: typeof botChannels.team === 'function' ? await botChannels.team() : '',
    leaderboard: leaderboard.map((row) => ({ ...row, channelManager: managerSet.has(row.userId) })),
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

/** Huddle totals for one channel, for the channel popup. */
function summariseHuddles(huddles, now) {
  const ended = huddles.filter((huddle) => huddle.status === 'ended');
  const durations = ended
    .map((huddle) => (toMillis(huddle.ended_at) - toMillis(huddle.started_at)) / 1000)
    .filter((seconds) => Number.isFinite(seconds) && seconds > 0 && Math.round(seconds) !== 43_200);
  const members = new Set();
  for (const huddle of huddles) {
    for (const member of parseJsonArray(huddle.participant_json)) {
      members.add(member);
    }
  }
  return {
    total: huddles.length,
    active: huddles.filter((huddle) => huddle.status === 'active').length,
    ended: ended.length,
    optedOut: huddles.filter((huddle) => huddle.status === 'opted_out').length,
    last24h: ended.filter((huddle) => now - toMillis(huddle.ended_at) < DAY_MS).length,
    longestSeconds: durations.length ? Math.round(Math.max(...durations)) : 0,
    averageSeconds: durations.length
      ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length)
      : 0,
    totalSeconds: Math.round(durations.reduce((total, value) => total + value, 0)),
    members: members.size,
  };
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
