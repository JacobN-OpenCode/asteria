/**
 * Who may see what on a surface anyone can load.
 *
 * The rule is about the channel, not the person:
 *
 *  - public channel   name, stats and managers are public. Everything here is
 *                     already visible to the whole workspace anyway.
 *  - private channel  the name is public (it is part of the workspace's channel
 *                     list), but the stats and the people are not. They open up
 *                     for the bot owner, the channel's managers, and anyone
 *                     signed in who is actually a member of that channel.
 *
 * Huddle pages are separate: they are owner-or-participant only and are not
 * covered here.
 */

/**
 * A channel counts as public only when Slack has positively said so.
 *
 * Deliberately not `Number(isPrivate) === 0`. That coerces `null`, `''` and
 * `false` to 0, so an unanswered lookup would read as a positive "public" and
 * publish a private channel's detail. Only the real number counts.
 */
export function isChannelPublic(isPrivate) {
  return isPrivate === 0;
}

/**
 * The label for a channel. Always the name, because the name of a private
 * channel is not the secret: its huddles and members are. Falls back to the id
 * when Slack never gave us a name.
 */
export function channelLabel({ name, channelId }) {
  return name || channelId;
}

/**
 * May this viewer see the stats and managers for this channel?
 *
 * `memberOfChannel` is the answer to "is this signed in person in that private
 * channel", looked up from Slack by the caller. It is ignored for public
 * channels.
 */
export function canSeeChannelDetail({
  isPrivate,
  isOwner = false,
  isManager = false,
  permissions = null,
  channelId = '',
  memberOfChannel = false,
}) {
  if (!isPrivate) {
    return true;
  }
  if (isOwner) {
    return true;
  }
  if (isManager && Array.isArray(permissions?.managedChannelIds) && permissions.managedChannelIds.includes(channelId)) {
    return true;
  }
  return Boolean(memberOfChannel);
}
