import { buildUserGroupOptions } from '../services/slack.js';
import { contentToMrkdwn } from '../utils/messages.js';
import { getDefaultQuestionTopics, normalizeTimeValue } from '../utils/time.js';

const QUESTION_TOPIC_OPTIONS = [
  'fun',
  'school',
  'technology',
  'creativity',
  'music',
  'swimming',
  'food',
  'hobbies',
  'random',
  'deep questions',
  'hypothetical questions',
];

function toBooleanString(value) {
  return value ? 'ON' : 'OFF';
}

function buildTabs(activeTab) {
  const tabs = [
    { id: 'daily-update', label: 'Daily Update' },
    { id: 'daily-question', label: 'Daily Question' },
    { id: 'welcomer', label: 'Welcomer' },
    { id: 'settings', label: 'Settings' },
  ];

  return {
    type: 'actions',
    block_id: 'navigation_tabs',
    elements: tabs.map((tab) => ({
      type: 'button',
      action_id: `navigate_${tab.id.replace(/-/g, '_')}`,
      text: {
        type: 'plain_text',
        text: tab.label,
      },
      value: tab.id,
      ...(tab.id === activeTab ? { style: 'primary' } : {}),
    })),
  };
}

function buildBanner(notice) {
  if (!notice) {
    return [];
  }

  return [
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: notice,
        },
      ],
    },
  ];
}

function buildReadOnlyView(settings) {
  return {
    type: 'home',
    callback_id: 'asteria_home_read_only',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Asteria',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Asteria is configured for another personal channel owner. If you are the owner, ask them to update `PERSONAL_CHANNEL_OWNER_ID` in the environment and restart the app.',
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Configured owner: <@${settings.personal_channel_owner_id || 'unknown'}>`,
          },
        ],
      },
    ],
  };
}

function buildTopSummary(settings) {
  const summaryLines = [
    `Timezone: *${settings.timezone}*`,
    `Daily Question: *${toBooleanString(settings.daily_question_enabled)}*`,
    `Welcomer: *${toBooleanString(settings.welcomer_enabled)}*`,
    `Reminder: *${toBooleanString(settings.daily_update_reminder_enabled)}*`,
  ];

  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: summaryLines.join('  ·  '),
    },
  };
}

function buildDailyUpdateView({ settings, draft, questionPreview, notice }) {
  const draftPreview = draft?.main_update_text ? contentToMrkdwn(draft.main_update_text) : '';

  return {
    type: 'home',
    callback_id: 'asteria_home_daily_update',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'Asteria' } },
      ...buildBanner(notice),
      buildTabs('daily-update'),
      buildTopSummary(settings),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "Compose today's update with full Slack formatting, then press *Send Daily Update*.",
        },
      },
      ...(questionPreview
        ? [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Daily Question preview*\n${questionPreview}`,
              },
            },
          ]
        : []),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: draftPreview
            ? `*Current draft*\n${draftPreview}`
            : 'No draft composed yet. Use *Compose Daily Update* to write today’s update.',
        },
      },
      {
        type: 'actions',
        block_id: 'daily_update_compose_actions',
        elements: [
          {
            type: 'button',
            action_id: 'open_daily_update_modal',
            text: {
              type: 'plain_text',
              text: 'Compose Daily Update',
            },
            style: 'primary',
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Thread reply*\n${settings.daily_update_thread_enabled ? 'Enabled' : 'Disabled'}`,
        },
      },
      {
        type: 'input',
        block_id: 'daily_update_thread_toggle_block',
        label: {
          type: 'plain_text',
          text: 'Enable thread starter message',
        },
        element: {
          type: 'checkboxes',
          action_id: 'daily_update_thread_enabled',
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Send a thread reply after the Daily Update',
              },
              value: 'enabled',
            },
          ],
          initial_options: settings.daily_update_thread_enabled
            ? [
                {
                  text: {
                    type: 'plain_text',
                    text: 'Send a thread reply after the Daily Update',
                  },
                  value: 'enabled',
                },
              ]
            : [],
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Thread starter message*\n${
            settings.daily_update_thread_message ? contentToMrkdwn(settings.daily_update_thread_message) : '_not set_'
          }`,
        },
      },
      {
        type: 'actions',
        block_id: 'daily_update_thread_actions',
        elements: [
          {
            type: 'button',
            action_id: 'open_thread_message_modal',
            text: {
              type: 'plain_text',
              text: 'Edit thread message',
            },
          },
        ],
      },
      {
        type: 'actions',
        block_id: 'daily_update_actions',
        elements: [
          {
            type: 'button',
            action_id: 'send_daily_update',
            text: {
              type: 'plain_text',
              text: 'Send Daily Update',
            },
            style: 'primary',
          },
        ],
      },
    ],
  };
}

function buildDailyQuestionView({ settings, notice, recentQuestions }) {
  const availableTopics = QUESTION_TOPIC_OPTIONS;
  const selectedTopics = new Set(
    (settings.daily_question_topics || getDefaultQuestionTopics()).map((topic) => topic.trim().toLowerCase()),
  );

  return {
    type: 'home',
    callback_id: 'asteria_home_daily_question',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'Asteria' } },
      ...buildBanner(notice),
      buildTabs('daily-question'),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Configure the AI-powered Daily Question that Asteria sends automatically each day.',
        },
      },
      {
        type: 'input',
        block_id: 'daily_question_enabled_block',
        label: {
          type: 'plain_text',
          text: 'Enable Daily Question',
        },
        element: {
          type: 'checkboxes',
          action_id: 'daily_question_enabled',
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Generate and post a Daily Question every day',
              },
              value: 'enabled',
            },
          ],
          initial_options: settings.daily_question_enabled
            ? [
                {
                  text: {
                    type: 'plain_text',
                    text: 'Generate and post a Daily Question every day',
                  },
                  value: 'enabled',
                },
              ]
            : [],
        },
      },
      {
        type: 'input',
        block_id: 'daily_question_topics_block',
        label: {
          type: 'plain_text',
          text: 'Question topics',
        },
        element: {
          type: 'multi_static_select',
          action_id: 'daily_question_topics',
          placeholder: {
            type: 'plain_text',
            text: 'Choose one or more topics',
          },
          options: availableTopics.map((topic) => ({
            text: { type: 'plain_text', text: topic },
            value: topic,
          })),
          initial_options: availableTopics
            .filter((topic) => selectedTopics.has(topic.toLowerCase()))
            .map((topic) => ({
              text: { type: 'plain_text', text: topic },
              value: topic,
            })),
        },
      },
      {
        type: 'input',
        block_id: 'daily_question_custom_topics_block',
        optional: true,
        label: {
          type: 'plain_text',
          text: 'Additional topics',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'daily_question_custom_topics',
          initial_value: settings.daily_question_custom_topics_text || '',
          placeholder: {
            type: 'plain_text',
            text: 'Optional comma-separated extras like robotics, art, or hikes',
          },
        },
      },
      {
        type: 'input',
        block_id: 'daily_question_tone_block',
        label: {
          type: 'plain_text',
          text: 'Tone',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'daily_question_tone',
          initial_value: settings.daily_question_tone || '',
          placeholder: {
            type: 'plain_text',
            text: 'For example: friendly, playful, and concise',
          },
        },
      },
      {
        type: 'input',
        block_id: 'daily_question_custom_instructions_block',
        optional: true,
        label: {
          type: 'plain_text',
          text: 'Custom instructions',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'daily_question_custom_instructions',
          multiline: true,
          initial_value: settings.daily_question_custom_instructions || '',
          placeholder: {
            type: 'plain_text',
            text: 'Add extra guidance for the AI here',
          },
        },
      },
      {
        type: 'input',
        block_id: 'daily_question_include_block',
        label: {
          type: 'plain_text',
          text: 'Include in Daily Update',
        },
        element: {
          type: 'checkboxes',
          action_id: 'daily_question_include_in_update',
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Also include the Daily Question text inside the Daily Update',
              },
              value: 'enabled',
            },
          ],
          initial_options: settings.daily_question_include_in_daily_update
            ? [
                {
                  text: {
                    type: 'plain_text',
                    text: 'Also include the Daily Question text inside the Daily Update',
                  },
                  value: 'enabled',
                },
              ]
            : [],
        },
      },
      {
        type: 'input',
        block_id: 'daily_question_send_time_block',
        label: {
          type: 'plain_text',
          text: 'Daily Question time',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'daily_question_send_time',
          initial_value: normalizeTimeValue(settings.daily_question_send_time, '09:00'),
          placeholder: {
            type: 'plain_text',
            text: 'HH:MM in the configured timezone',
          },
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            recentQuestions.length > 0
              ? `*Recent questions*\n${recentQuestions
                  .slice(0, 3)
                  .map((question) => `• ${question}`)
                  .join('\n')}`
              : '*Recent questions*\nNo Daily Questions have been generated yet.',
        },
      },
      {
        type: 'actions',
        block_id: 'daily_question_actions',
        elements: [
          {
            type: 'button',
            action_id: 'save_daily_question_settings',
            text: { type: 'plain_text', text: 'Save Daily Question Settings' },
            style: 'primary',
          },
        ],
      },
    ],
  };
}

function buildWelcomerView({ settings, notice }) {
  return {
    type: 'home',
    callback_id: 'asteria_home_welcomer',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'Asteria' } },
      ...buildBanner(notice),
      buildTabs('welcomer'),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Configure the welcome message that Asteria sends when someone joins the personal channel.',
        },
      },
      {
        type: 'input',
        block_id: 'welcomer_enabled_block',
        label: {
          type: 'plain_text',
          text: 'Enable Welcomer',
        },
        element: {
          type: 'checkboxes',
          action_id: 'welcomer_enabled',
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Send a welcome message when a user joins the channel',
              },
              value: 'enabled',
            },
          ],
          initial_options: settings.welcomer_enabled
            ? [
                {
                  text: {
                    type: 'plain_text',
                    text: 'Send a welcome message when a user joins the channel',
                  },
                  value: 'enabled',
                },
              ]
            : [],
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Welcome message*\n${
            settings.welcome_message_content
              ? contentToMrkdwn(settings.welcome_message_content)
              : '_not set — a default welcome will be used_'
          }`,
        },
      },
      {
        type: 'actions',
        block_id: 'welcome_message_actions',
        elements: [
          {
            type: 'button',
            action_id: 'open_welcome_message_modal',
            text: { type: 'plain_text', text: 'Edit welcome message' },
            style: 'primary',
          },
        ],
      },
      {
        type: 'input',
        block_id: 'rules_canvas_block',
        optional: true,
        label: {
          type: 'plain_text',
          text: 'Rules Canvas URL',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'rules_canvas_url',
          initial_value: settings.rules_canvas_url || '',
          placeholder: {
            type: 'plain_text',
            text: 'Optional https://... canvas URL',
          },
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Placeholder reference: `{user}` becomes the new Slack member mention.',
          },
        ],
      },
      {
        type: 'actions',
        block_id: 'welcomer_actions',
        elements: [
          {
            type: 'button',
            action_id: 'save_welcomer_settings',
            text: { type: 'plain_text', text: 'Save Welcomer Settings' },
            style: 'primary',
          },
        ],
      },
    ],
  };
}

function buildSettingsView({ settings, notice, userGroups }) {
  const currentUserGroupOptions = buildUserGroupOptions(userGroups, settings.daily_update_ping_user_group_id);
  const userGroupsTruncated = userGroups.length > 100;

  return {
    type: 'home',
    callback_id: 'asteria_home_settings',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'Asteria' } },
      ...buildBanner(notice),
      buildTabs('settings'),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'General settings for Asteria, including timezone, reminder timing, the personal channel, and the Daily Update ping group.',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Configured owner*\n<@${settings.personal_channel_owner_id}>`,
        },
      },
      {
        type: 'input',
        block_id: 'timezone_block',
        label: { type: 'plain_text', text: 'Timezone' },
        element: {
          type: 'plain_text_input',
          action_id: 'timezone',
          initial_value: settings.timezone || 'UTC',
          placeholder: {
            type: 'plain_text',
            text: 'Use an IANA timezone like Europe/London',
          },
        },
      },
      {
        type: 'input',
        block_id: 'daily_update_reminder_enabled_block',
        label: {
          type: 'plain_text',
          text: 'Daily Update reminder',
        },
        element: {
          type: 'checkboxes',
          action_id: 'daily_update_reminder_enabled',
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Send a DM reminder if no Daily Update has been sent by the deadline',
              },
              value: 'enabled',
            },
          ],
          initial_options: settings.daily_update_reminder_enabled
            ? [
                {
                  text: {
                    type: 'plain_text',
                    text: 'Send a DM reminder if no Daily Update has been sent by the deadline',
                  },
                  value: 'enabled',
                },
              ]
            : [],
        },
      },
      {
        type: 'input',
        block_id: 'daily_update_reminder_time_block',
        label: { type: 'plain_text', text: 'Reminder deadline' },
        element: {
          type: 'plain_text_input',
          action_id: 'daily_update_reminder_time',
          initial_value: normalizeTimeValue(settings.daily_update_reminder_time, '17:00'),
          placeholder: {
            type: 'plain_text',
            text: 'HH:MM in the configured timezone',
          },
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Personal channel*\n${
            settings.personal_channel_id ? `\`${settings.personal_channel_id}\`` : '_not set_'
          }`,
        },
        accessory: {
          type: 'button',
          action_id: 'open_personal_channel_modal',
          text: {
            type: 'plain_text',
            text: 'Change channel',
          },
        },
      },
      {
        type: 'input',
        block_id: 'daily_update_ping_group_block',
        label: { type: 'plain_text', text: 'Daily Update ping group' },
        element: {
          type: 'static_select',
          action_id: 'daily_update_ping_user_group_id',
          placeholder: {
            type: 'plain_text',
            text: 'Choose a Slack user group',
          },
          options:
            currentUserGroupOptions.length > 0
              ? currentUserGroupOptions.map((option) => ({
                  text: option.text,
                  value: option.value,
                }))
              : [
                  {
                    text: {
                      type: 'plain_text',
                      text: settings.daily_update_ping_user_group_id || 'No user groups loaded',
                    },
                    value: settings.daily_update_ping_user_group_id || '',
                  },
                ],
          initial_option: currentUserGroupOptions.find(
            (option) => option.value === settings.daily_update_ping_user_group_id,
          )
            ? {
                text: currentUserGroupOptions.find(
                  (option) => option.value === settings.daily_update_ping_user_group_id,
                ).text,
                value: settings.daily_update_ping_user_group_id,
              }
            : undefined,
        },
      },
      ...(userGroupsTruncated
        ? [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: 'Slack limits the group list to 100 options; your selected group is always shown.',
                },
              ],
            },
          ]
        : []),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Configured personal channel: \`${settings.personal_channel_id || 'not set'}\`\nDaily update ping group: ${settings.daily_update_ping_user_group_id ? `<!subteam^${settings.daily_update_ping_user_group_id}>` : '_not set_'}`,
        },
      },
      {
        type: 'actions',
        block_id: 'settings_actions',
        elements: [
          {
            type: 'button',
            action_id: 'save_general_settings',
            text: { type: 'plain_text', text: 'Save Settings' },
            style: 'primary',
          },
        ],
      },
    ],
  };
}

export function buildHomeView({ tab, settings, draft, questionPreview, recentQuestions, notice, userGroups, isOwner }) {
  if (!isOwner) {
    return buildReadOnlyView(settings);
  }

  if (tab === 'daily-question') {
    return buildDailyQuestionView({
      settings,
      notice,
      recentQuestions: recentQuestions || [],
    });
  }

  if (tab === 'welcomer') {
    return buildWelcomerView({ settings, notice });
  }

  if (tab === 'settings') {
    return buildSettingsView({
      settings,
      notice,
      userGroups: userGroups || [],
    });
  }

  return buildDailyUpdateView({ settings, draft, questionPreview, notice });
}
