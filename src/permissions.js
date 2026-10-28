/**
 * Who may do what, in one place.
 *
 * This used to live in three copies (dashboard/permissions.js,
 * app-home/permissions.js and a private copy inside dashboard/server.js) that
 * disagreed about which Slack ids are valid and which channel a manager may
 * touch. Everything now reads from here.
 *
 *  - owner    the app owner (app_settings.personal_channel_owner_id). Everything:
 *             global settings, every channel, every log, the admin panel.
 *  - manager  listed in huddle_channels.owner_ids for at least one channel. May
 *             configure those channels and see their stats. Nothing global.
 *  - user     anyone else with a Slack account, whether signed in or anonymous.
 *             Aggregate stats only.
 */
export const ROLES = { OWNER: 'owner', MANAGER: 'manager', USER: 'user', FAKE_ADMIN: 'fake_admin' };

/** A plausible Slack user id. Deliberately permissive: real ids are `U…`/`W…`. */
export function isSlackUserId(value) {
  return typeof value === 'string' && /^[UW][A-Z0-9]+$/.test(value);
}

/**
 * Read a stored owner list. Rows hold JSON, but older rows are plain arrays and
 * a hand edit can leave junk behind, so anything unparseable reads as empty
 * rather than throwing somewhere deep in a request.
 */
export function parseOwnerIds(raw) {
  if (Array.isArray(raw)) {
    return raw.filter(isSlackUserId);
  }
  if (typeof raw !== 'string' || raw.trim() === '') {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSlackUserId) : [];
  } catch {
    return [];
  }
}

/**
 * Turn typed input (`"U123, <@U456>"`, a list, or a single id) into ids.
 * Used by the App Home text fields, never to read something already stored.
 */
export function parseOwnerIdList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.filter(isSlackUserId))];
  }
  const text = typeof value === 'string' ? value : '';
  return [...new Set(text.match(/[UW][A-Z0-9]+/g) || [])];
}

export function createPermissions({ store }) {
  /** The app owner. No id means no owner, so a blank setting locks everyone out. */
  function isOwner(userId) {
    const ownerId = store.getSettings().personal_channel_owner_id;
    return Boolean(userId) && Boolean(ownerId) && userId === ownerId;
  }

  function channelOwners(channelId) {
    if (!channelId) {
      return [];
    }
    return parseOwnerIds(store.getHuddleChannel(channelId)?.owner_ids);
  }

  /** Null means "every channel", which is why the owner is not a list of ids. */
  function managedChannelIds(userId) {
    if (!userId) {
      return [];
    }
    if (isOwner(userId)) {
      return null;
    }
    return store
      .listHuddleChannels()
      .filter((channel) => parseOwnerIds(channel.owner_ids).includes(userId))
      .map((channel) => channel.channel_id);
  }

  function resolve(slackUserId) {
    if (!slackUserId) {
      return { role: null, isOwner: false, isManager: false, fakeAdmin: false, managedChannelIds: [] };
    }
    if (isOwner(slackUserId)) {
      return { role: ROLES.OWNER, isOwner: true, isManager: true, fakeAdmin: false, managedChannelIds: null };
    }
    if (isFakeAdmin(slackUserId)) {
      // isManager so the channel and admin tabs open, but no managed ids, so no
      // channel is actually theirs to change.
      return {
        role: ROLES.FAKE_ADMIN,
        isOwner: false,
        isManager: true,
        fakeAdmin: true,
        managedChannelIds: [],
      };
    }
    const ids = managedChannelIds(slackUserId);
    if (ids.length > 0) {
      return { role: ROLES.MANAGER, isOwner: false, isManager: true, fakeAdmin: false, managedChannelIds: ids };
    }
    return { role: ROLES.USER, isOwner: false, isManager: false, fakeAdmin: false, managedChannelIds: [] };
  }

  /** Owner or a manager of that specific channel. Never a manager of another. */
  function mayConfigureChannel(userId, channelId) {
    if (!userId || !channelId) {
      return false;
    }
    return isOwner(userId) || channelOwners(channelId).includes(userId);
  }

  /**
   * A "fake admin": they can open every admin surface and read it, but every
   * write is refused. Deliberately separate from isOwner so no existing check
   * accidentally grants them anything.
   */
  function isFakeAdmin(userId) {
    if (!userId || isOwner(userId)) {
      return false;
    }
    return store.getFakeAdminIds().includes(userId);
  }

  function isChannelOwner(userId) {
    if (!userId) {
      return false;
    }
    return store.listHuddleChannels().some((channel) => parseOwnerIds(channel.owner_ids).includes(userId));
  }

  return {
    isOwner,
    isFakeAdmin,
    isChannelOwner,
    channelOwners,
    managedChannelIds,
    resolve,
    mayConfigureChannel,
  };
}
