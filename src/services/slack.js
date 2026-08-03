import {
  formatDailyQuestionMessage,
  formatDailyUpdateMessage,
  formatUserGroupMention,
  replaceWelcomePlaceholders,
} from '../utils/messages.js';

const USER_GROUP_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedUserGroups = [];
let cachedUserGroupsAt = 0;

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function buildUserGroupOptions(userGroups, selectedGroupId) {
  return ensureArray(userGroups).map((group) => ({
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

export async function resolveBotUserId(client) {
  const response = await client.auth.test();
  return response.user_id;
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

export async function sendDailyUpdate(client, settings, draft, questionText, { sentByUserId }) {
  const text = buildDailyUpdateText(settings, draft, questionText);
  const response = await client.chat.postMessage({
    channel: settings.personal_channel_id,
    text,
    username: 'Asteria',
    icon_emoji: ':sparkles:',
  });

  let threadTs = response.ts;
  if (settings.daily_update_thread_enabled && settings.daily_update_thread_message?.trim()) {
    const threadResponse = await client.chat.postMessage({
      channel: settings.personal_channel_id,
      thread_ts: response.ts,
      text: settings.daily_update_thread_message.trim(),
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
  const welcomeText = replaceWelcomePlaceholders(settings.welcome_message_content, { userId });
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
