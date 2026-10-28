import { createPermissions, parseOwnerIdList } from '../permissions.js';

export { parseOwnerIdList };

/**
 * The App Home's view of the shared permission rules.
 *
 * Kept as a named factory because App Home asks "may this person configure this
 * channel" from a modal submission, not from a session.
 */
export function createChannelPermissions({ store }) {
  const permissions = createPermissions({ store });
  return {
    isOwner: permissions.isOwner,
    isChannelOwner: permissions.isChannelOwner,
    mayConfigureChannel: permissions.mayConfigureChannel,
    configuredChannelOwnerIds: () =>
      new Set(store.listHuddleChannels().flatMap((row) => parseOwnerIdList(row.owner_ids))),
  };
}
