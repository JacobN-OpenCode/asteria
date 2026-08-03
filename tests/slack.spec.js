import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import { sendDailyUpdate, sendWelcomeMessage } from '../src/services/slack.js';

describe('Daily Update owner masking', () => {
  it('posts the Daily Update under the owner display name and avatar via chat:write.customize', async () => {
    const client = {
      users: {
        profile: {
          get: mock.fn(async () => ({
            profile: {
              display_name: 'Jordan',
              real_name: 'Asteria Owner',
              image_512: 'https://example.com/avatar-512.png',
            },
          })),
        },
      },
      chat: {
        postMessage: mock.fn(async () => ({ ts: '111.222' })),
      },
    };

    const settings = {
      personal_channel_owner_id: 'UOWNER',
      personal_channel_id: 'C123',
      daily_update_ping_user_group_id: 'S123',
      daily_question_include_in_daily_update: false,
      daily_update_thread_enabled: false,
      daily_update_thread_message: '',
    };
    const draft = {
      main_update_text: 'Today I shipped Asteria.',
      song_text: '',
      event_text: '',
    };

    const result = await sendDailyUpdate(client, settings, draft, '', {
      sentByUserId: 'UOWNER',
    });

    assert.equal(client.users.profile.get.mock.callCount(), 1);
    assert.equal(client.chat.postMessage.mock.callCount(), 1);

    const callArgs = client.chat.postMessage.mock.calls[0].arguments[0];
    assert.equal(callArgs.username, 'Jordan');
    assert.equal(callArgs.icon_url, 'https://example.com/avatar-512.png');
    assert(callArgs.text.includes('<!subteam^S123>'));
    assert(!callArgs.text.includes('Jordan'));
    assert.equal(result.messageTs, '111.222');
  });

  it('falls back to the Asteria bot identity when the owner profile cannot be read', async () => {
    const client = {
      users: {
        profile: {
          get: mock.fn(async () => {
            throw new Error('missing_scope');
          }),
        },
      },
      chat: {
        postMessage: mock.fn(async () => ({ ts: '333.444' })),
      },
    };

    const settings = {
      personal_channel_owner_id: 'UFALLBACK',
      personal_channel_id: 'C123',
      daily_update_ping_user_group_id: '',
      daily_question_include_in_daily_update: false,
      daily_update_thread_enabled: false,
      daily_update_thread_message: '',
    };
    const draft = {
      main_update_text: 'Hello',
      song_text: '',
      event_text: '',
    };

    await sendDailyUpdate(client, settings, draft, '', {
      sentByUserId: 'UFALLBACK',
    });

    const callArgs = client.chat.postMessage.mock.calls[0].arguments[0];
    assert.equal(callArgs.username, 'Asteria');
    assert.equal(callArgs.icon_emoji, ':sparkles:');
    assert.equal(callArgs.icon_url, undefined);
  });

  it('posts a thread starter reply as the bot when thread mode is enabled', async () => {
    const client = {
      users: {
        profile: {
          get: mock.fn(async () => ({
            profile: {
              display_name: 'Jordan',
              image_192: 'https://example.com/avatar-192.png',
            },
          })),
        },
      },
      chat: {
        postMessage: mock.fn(async () => ({ ts: '555.666' })),
      },
    };

    const settings = {
      personal_channel_owner_id: 'UOWNER',
      personal_channel_id: 'C123',
      daily_update_ping_user_group_id: '',
      daily_question_include_in_daily_update: false,
      daily_update_thread_enabled: true,
      daily_update_thread_message: ':thread: here please!!',
    };
    const draft = {
      main_update_text: 'Posting with a thread',
      song_text: '',
      event_text: '',
    };

    const result = await sendDailyUpdate(client, settings, draft, '', {
      sentByUserId: 'UOWNER',
    });

    assert.equal(client.chat.postMessage.mock.callCount(), 2);
    const mainCall = client.chat.postMessage.mock.calls[0].arguments[0];
    assert.equal(mainCall.username, 'Jordan');
    const threadCall = client.chat.postMessage.mock.calls[1].arguments[0];
    assert.equal(threadCall.thread_ts, '555.666');
    assert.equal(threadCall.username, 'Asteria');
    assert.equal(result.threadTs, '555.666');
  });

  it('converts a rich text thread starter message to mrkdwn', async () => {
    const client = {
      users: {
        profile: {
          get: mock.fn(async () => ({
            profile: {
              display_name: 'Jordan',
              image_192: 'https://example.com/avatar-192.png',
            },
          })),
        },
      },
      chat: {
        postMessage: mock.fn(async () => ({ ts: '555.666' })),
      },
    };

    const settings = {
      personal_channel_owner_id: 'UOWNER',
      personal_channel_id: 'C123',
      daily_update_ping_user_group_id: '',
      daily_question_include_in_daily_update: false,
      daily_update_thread_enabled: true,
      daily_update_thread_message: JSON.stringify([
        {
          type: 'rich_text_section',
          elements: [
            { type: 'text', text: 'Discussions', bold: true },
            { type: 'text', text: ' ' },
            { type: 'text', text: 'here' },
          ],
        },
      ]),
    };
    const draft = {
      main_update_text: 'Posting with a thread',
      song_text: '',
      event_text: '',
    };

    await sendDailyUpdate(client, settings, draft, '', {
      sentByUserId: 'UOWNER',
    });

    const threadCall = client.chat.postMessage.mock.calls[1].arguments[0];
    assert.equal(threadCall.text, '*Discussions* here');
  });

  it('converts a rich text welcome message and replaces the user mention', async () => {
    const client = {
      chat: {
        postMessage: mock.fn(async () => ({ ts: '777.888' })),
      },
    };

    const settings = {
      personal_channel_id: 'C123',
      welcome_message_content: JSON.stringify([
        {
          type: 'rich_text_section',
          elements: [
            { type: 'text', text: 'Welcome ' },
            { type: 'text', text: '{user}', bold: true },
            { type: 'text', text: ' to the club!' },
          ],
        },
      ]),
      rules_canvas_url: '',
    };

    const response = await sendWelcomeMessage(client, settings, { userId: 'U123' });

    const callArgs = client.chat.postMessage.mock.calls[0].arguments[0];
    assert(callArgs.text.includes('Welcome *<@U123>* to the club!'));
    assert.equal(response.ts, '777.888');
  });
});
