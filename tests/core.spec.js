import assert from 'node:assert';
import { describe, it } from 'node:test';
import { buildHomeView } from '../src/app-home/views.js';
import {
  formatDailyQuestionMessage,
  formatDailyUpdateMessage,
  formatUserGroupMention,
  isRepeatedQuestion,
  replaceWelcomePlaceholders,
} from '../src/utils/messages.js';
import { getLocalDateKey, isValidTimeZone } from '../src/utils/time.js';

describe('Asteria core helpers', () => {
  it('formats the Daily Update with optional song and event sections', () => {
    const message = formatDailyUpdateMessage({
      userGroupId: 'S123ABC',
      mainUpdateText: 'Ship it',
      songText: 'Never Gonna Give You Up',
      eventText: '',
      includeQuestion: false,
    });

    assert(message.includes('<!subteam^S123ABC>'));
    assert(message.includes('*DAILY UPDATE*'));
    assert(message.includes('Ship it'));
    assert(message.includes('Song of the Day: Never Gonna Give You Up'));
    assert(!message.includes('Event of the Day:'));
  });

  it('formats the Daily Question and user group mention syntax', () => {
    assert.equal(formatUserGroupMention('S123ABC'), '<!subteam^S123ABC>');
    assert.equal(
      formatDailyQuestionMessage('What is your favorite build this week?'),
      '❓ Daily Question\n\nWhat is your favorite build this week?\n\nReply to this message in a thread!',
    );
  });

  it('replaces welcome placeholders and detects repeated questions', () => {
    assert.equal(replaceWelcomePlaceholders('Welcome {user}!', { userId: 'U123' }), 'Welcome <@U123>!');
    assert.equal(isRepeatedQuestion('What is your favorite snack?', ['What is your favorite snack?']), true);
    assert.equal(isRepeatedQuestion('What is your favorite snack?', ['What is your favorite color?']), false);
  });

  it('validates time zones and derives a local date key', () => {
    assert.equal(isValidTimeZone('Europe/London'), true);
    assert.equal(isValidTimeZone('Definitely/NotAZone'), false);
    assert.match(getLocalDateKey(new Date('2026-08-03T12:00:00Z'), 'UTC'), /^2026-08-03$/);
  });

  it('shows a restricted App Home for non-owners', () => {
    const view = buildHomeView({
      tab: 'daily-update',
      settings: {
        personal_channel_owner_id: 'UOWNER',
        timezone: 'UTC',
        daily_question_enabled: true,
        welcomer_enabled: true,
        daily_update_reminder_enabled: true,
      },
      draft: { main_update_text: '', song_text: '', event_text: '' },
      questionPreview: '',
      recentQuestions: [],
      notice: '',
      userGroups: [],
      isOwner: false,
    });

    assert.equal(view.type, 'home');
    assert(
      view.blocks.some(
        (block) =>
          block.type === 'section' && block.text?.text.includes('configured for another personal channel owner'),
      ),
    );
    assert(!view.blocks.some((block) => block.block_id === 'navigation_tabs'));
  });
});
