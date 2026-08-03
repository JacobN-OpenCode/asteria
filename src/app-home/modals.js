import { toRichTextInitialValue } from '../utils/messages.js';

function buildRichTextInput({ blockId, actionId, label, initialValue, placeholder, optional = false }) {
  return {
    type: 'input',
    block_id: blockId,
    optional,
    label: {
      type: 'plain_text',
      text: label,
    },
    element: {
      type: 'rich_text_input',
      action_id: actionId,
      ...(initialValue ? { initial_value: initialValue } : {}),
      placeholder: {
        type: 'plain_text',
        text: placeholder,
      },
    },
  };
}

function buildPlainTextInput({ blockId, actionId, label, initialValue, placeholder, optional = false }) {
  return {
    type: 'input',
    block_id: blockId,
    optional,
    label: {
      type: 'plain_text',
      text: label,
    },
    element: {
      type: 'plain_text_input',
      action_id: actionId,
      initial_value: initialValue || '',
      placeholder: {
        type: 'plain_text',
        text: placeholder,
      },
    },
  };
}

export function buildDailyUpdateModal({ draft }) {
  return {
    type: 'modal',
    callback_id: 'compose_daily_update_submit',
    title: { type: 'plain_text', text: 'Compose Daily Update' },
    submit: { type: 'plain_text', text: 'Save draft' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Format with Slack styling — bold, links, lists, mentions and code all render when sent.',
          },
        ],
      },
      buildRichTextInput({
        blockId: 'daily_update_main_block',
        actionId: 'daily_update_main_text',
        label: 'Daily Update',
        initialValue: toRichTextInitialValue(draft?.main_update_text),
        placeholder: "Write today's update here",
      }),
      buildPlainTextInput({
        blockId: 'daily_update_song_block',
        actionId: 'daily_update_song_text',
        label: 'Song of the Day',
        initialValue: draft?.song_text,
        placeholder: 'Optional: a track title or link',
        optional: true,
      }),
      buildPlainTextInput({
        blockId: 'daily_update_event_block',
        actionId: 'daily_update_event_text',
        label: 'Event of the Day',
        initialValue: draft?.event_text,
        placeholder: 'Optional: anything you want to announce',
        optional: true,
      }),
    ],
  };
}

export function buildThreadMessageModal({ settings }) {
  return {
    type: 'modal',
    callback_id: 'edit_thread_message_submit',
    title: { type: 'plain_text', text: 'Thread starter message' },
    submit: { type: 'plain_text', text: 'Save' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      buildRichTextInput({
        blockId: 'thread_message_block',
        actionId: 'thread_message_content',
        label: 'Thread starter message',
        initialValue: toRichTextInitialValue(settings.daily_update_thread_message),
        placeholder: 'For example: :thread: here please!!',
      }),
    ],
  };
}

export function buildWelcomeMessageModal({ settings }) {
  return {
    type: 'modal',
    callback_id: 'edit_welcome_message_submit',
    title: { type: 'plain_text', text: 'Welcome message' },
    submit: { type: 'plain_text', text: 'Save' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      buildRichTextInput({
        blockId: 'welcome_message_block',
        actionId: 'welcome_message_content',
        label: 'Welcome message',
        initialValue: toRichTextInitialValue(settings.welcome_message_content),
        placeholder: 'Welcome to the channel!',
      }),
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Type `{user}` where you want the new member mention to appear.',
          },
        ],
      },
    ],
  };
}

export function buildPingGroupModal({ selectedGroup = null }) {
  return {
    type: 'modal',
    callback_id: 'edit_ping_group_submit',
    title: { type: 'plain_text', text: 'Daily Update ping group' },
    submit: { type: 'plain_text', text: 'Save' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'ping_group_block',
        label: { type: 'plain_text', text: 'Ping group' },
        element: {
          type: 'external_select',
          action_id: 'select_ping_user_group',
          min_query_length: 1,
          placeholder: {
            type: 'plain_text',
            text: 'Start typing a user group name or handle',
          },
          ...(selectedGroup
            ? {
                initial_option: {
                  text: { type: 'plain_text', text: selectedGroup.label },
                  value: selectedGroup.id,
                },
              }
            : {}),
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Search for the group by name or handle, then pick it from the list.',
          },
        ],
      },
    ],
  };
}

export function buildPersonalChannelModal({ settings }) {
  return {
    type: 'modal',
    callback_id: 'edit_personal_channel_submit',
    title: { type: 'plain_text', text: 'Personal channel' },
    submit: { type: 'plain_text', text: 'Save' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'personal_channel_block',
        label: {
          type: 'plain_text',
          text: 'Personal channel',
        },
        element: {
          type: 'conversations_select',
          action_id: 'personal_channel_id',
          filter: {
            include: ['public', 'private'],
            exclude_bot_users: true,
          },
          ...(settings.personal_channel_id ? { initial_conversation: settings.personal_channel_id } : {}),
          placeholder: {
            type: 'plain_text',
            text: 'Choose the personal channel',
          },
        },
      },
    ],
  };
}
