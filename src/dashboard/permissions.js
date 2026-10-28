import { createPermissions, ROLES } from '../permissions.js';

export { ROLES };

const permissions = new WeakMap();

function forStore(store) {
  if (!permissions.has(store)) {
    permissions.set(store, createPermissions({ store }));
  }
  return permissions.get(store);
}

/** The dashboard's view of the shared permission rules. */
export function resolvePermissions({ store, slackUserId, settings = null }) {
  if (settings && settings.personal_channel_owner_id === slackUserId) {
    return { role: ROLES.OWNER, isOwner: true, isManager: true, managedChannelIds: null };
  }
  return forStore(store).resolve(slackUserId);
}
