/**
 * Who gets to see what on the dashboard.
 *
 *  - owner    the app owner (PERSONAL_CHANNEL_OWNER_ID / settings). Everything:
 *             live stats for every channel, the activity log, channel configuration.
 *  - manager  listed as an owner of at least one tracked channel. Sees the channels
 *             they manage and nothing else — no global log, no other channels.
 *  - user     anyone else who signed in with Slack. Aggregate stats plus control
 *             over whether they appear on the leaderboard.
 */
export const ROLES = { OWNER: 'owner', MANAGER: 'manager', USER: 'user' };

export function resolvePermissions({ store, slackUserId, settings = null }) {
  if (!slackUserId) {
    return { role: null, isOwner: false, isManager: false, managedChannelIds: [] };
  }
  const resolvedSettings = settings ?? store.getSettings();
  if (resolvedSettings.personal_channel_owner_id === slackUserId) {
    return { role: ROLES.OWNER, isOwner: true, isManager: true, managedChannelIds: null };
  }
  const managedChannelIds = store
    .listHuddleChannels()
    .filter((channel) => (parseOwnerIds(channel.owner_ids) || []).includes(slackUserId))
    .map((channel) => channel.channel_id);
  if (managedChannelIds.length > 0) {
    return { role: ROLES.MANAGER, isOwner: false, isManager: true, managedChannelIds };
  }
  return { role: ROLES.USER, isOwner: false, isManager: false, managedChannelIds: [] };
}

function parseOwnerIds(raw) {
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
