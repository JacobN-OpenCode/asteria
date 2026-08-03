import {
  contentToMrkdwn,
  formatDailyQuestionMessage,
  formatDailyUpdateMessage,
  formatUserGroupMention,
  replaceWelcomePlaceholders,
} from '../utils/messages.js';

const USER_GROUP_CACHE_TTL_MS = 5 * 60 * 1000;
const OWNER_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_USER_GROUP_OPTIONS = 100;

let cachedUserGroups = [];
let cachedUserGroupsAt = 0;

let cachedOwnerIdentity = null;
let cachedOwnerIdentityAt = 0;
let cachedOwnerUserId = '';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function buildUserGroupOptions(userGroups, selectedGroupId) {
  const allOptions = ensureArray(userGroups).map((group) => ({
    text: {
      type: 'plain_text',
      text: `${group.handle ? `@${group.handle}` : group.name}${group.description ? ` · ${group.description}` : ''}`.slice(
        0,
        75,
      ),
    },
    value: group.id,
    selected: group.id === selectedGroupId,
  }));

  const selectedOption = allOptions.find((option) => option.value === selectedGroupId);
  const cappedOptions = allOptions.slice(0, MAX_USER_GROUP_OPTIONS);
  if (selectedOption && !cappedOptions.some((option) => option.value === selectedGroupId)) {
    if (cappedOptions.length >= MAX_USER_GROUP_OPTIONS) {
      cappedOptions.pop();
    }
    cappedOptions.unshift(selectedOption);
  }
  return cappedOptions;
}

export function normalizeUserGroups(responseBody) {
  return ensureArray(responseBody?.usergroups).map((group) => ({
    id: group.id,
    name: group.name,
    handle: group.handle,
    description: group.description || '',
  }));
}

export async function fetchUserGroups(client, { forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cachedUserGroups.length > 0 && now - cachedUserGroupsAt < USER_GROUP_CACHE_TTL_MS) {
    return cachedUserGroups;
  }

  try {
    const response = await client.usergroups.list({ include_users: false });
    cachedUserGroups = normalizeUserGroups(response);
    cachedUserGroupsAt = now;
    return cachedUserGroups;
  } catch {
    return cachedUserGroups;
  }
}

export async function resolveOwnerIdentity(client, ownerUserId) {
  const response = await client.users.profile.get({ user: ownerUserId });
  const profile = response?.profile ?? {};
  return {
    displayName: profile.display_name || profile.real_name || '',
    iconUrl: profile.image_512 || profile.image_192 || profile.image_48 || '',
  };
}

export async function fetchOwnerIdentity(client, ownerUserId, { forceRefresh = false } = {}) {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedOwnerIdentity &&
    cachedOwnerUserId === ownerUserId &&
    now - cachedOwnerIdentityAt < OWNER_PROFILE_CACHE_TTL_MS
  ) {
    return cachedOwnerIdentity;
  }

  try {
    const identity = await resolveOwnerIdentity(client, ownerUserId);
    cachedOwnerIdentity = identity;
    cachedOwnerUserId = ownerUserId;
    cachedOwnerIdentityAt = now;
    return identity;
  } catch {
    if (cachedOwnerUserId === ownerUserId && cachedOwnerIdentity) {
      return cachedOwnerIdentity;
    }
    return { displayName: '', iconUrl: '' };
  }
}

export async function ensureDirectMessageChannel(client, userId) {
  const response = await client.conversations.open({ users: userId });
  return response.channel.id;
}

export async function sendDirectMessage(client, userId, text) {
  const channelId = await ensureDirectMessageChannel(client, userId);
  return client.chat.postMessage({ channel: channelId, text });
}

export function buildDailyUpdateText(settings, draft, questionText) {
  return formatDailyUpdateMessage({
    userGroupId: settings.daily_update_ping_user_group_id,
    mainUpdateText: draft.main_update_text,
    songText: draft.song_text,
    eventText: draft.event_text,
    questionText,
    includeQuestion: settings.daily_question_include_in_daily_update,
  });
}

function buildDailyUpdateIdentity(ownerIdentity) {
  if (ownerIdentity.displayName && ownerIdentity.iconUrl) {
    return {
      username: ownerIdentity.displayName,
      icon_url: ownerIdentity.iconUrl,
    };
  }

  if (ownerIdentity.displayName) {
    return {
      username: ownerIdentity.displayName,
      icon_emoji: ':sparkles:',
    };
  }

  return {
    username: 'Asteria',
    icon_emoji: ':sparkles:',
  };
}

export async function sendDailyUpdate(client, settings, draft, questionText, { sentByUserId }) {
  const text = buildDailyUpdateText(settings, draft, questionText);
  const ownerIdentity = await fetchOwnerIdentity(client, settings.personal_channel_owner_id);
  const dailyUpdateIdentity = buildDailyUpdateIdentity(ownerIdentity);

  const response = await client.chat.postMessage({
    channel: settings.personal_channel_id,
    text,
    ...dailyUpdateIdentity,
  });

  let threadTs = response.ts;
  const threadMessage = contentToMrkdwn(settings.daily_update_thread_message).trim();
  if (settings.daily_update_thread_enabled && threadMessage) {
    const threadResponse = await client.chat.postMessage({
      channel: settings.personal_channel_id,
      thread_ts: response.ts,
      text: threadMessage,
      username: 'Asteria',
      icon_emoji: ':sparkles:',
    });

    threadTs = threadResponse.thread_ts || threadResponse.ts || response.ts;
  }

  return {
    messageTs: response.ts,
    threadTs,
    text,
    sentByUserId,
    userGroupMention: formatUserGroupMention(settings.daily_update_ping_user_group_id),
  };
}

export async function sendDailyQuestion(client, settings, questionText) {
  const text = formatDailyQuestionMessage(questionText, settings.daily_question_reply_text);
  const response = await client.chat.postMessage({
    channel: settings.personal_channel_id,
    text,
    username: 'Asteria',
    icon_emoji: ':sparkles:',
  });

  return {
    messageTs: response.ts,
    text,
  };
}

export async function sendWelcomeMessage(client, settings, { userId }) {
  const welcomeText = replaceWelcomePlaceholders(contentToMrkdwn(settings.welcome_message_content), { userId });
  const messageParts = [welcomeText];

  if (settings.rules_canvas_url?.trim()) {
    messageParts.push(`📖 Please read the rules here:\n${settings.rules_canvas_url.trim()}`);
  }

  const response = await client.chat.postMessage({
    channel: settings.personal_channel_id,
    text: messageParts.join('\n\n'),
    username: 'Asteria',
    icon_emoji: ':sparkles:',
  });

  return response;
}
