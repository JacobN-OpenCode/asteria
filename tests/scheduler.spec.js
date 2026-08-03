import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import { DateTime } from 'luxon';
import { createScheduler } from '../src/scheduler.js';

describe('scheduler', () => {
  it('sends a reminder only once per local day', async () => {
    const now = DateTime.utc();
    const currentClock = now.setZone('UTC').toFormat('HH:mm');
    const claimedJobs = new Set();
    let directMessageCount = 0;

    const store = {
      getSettings: () => ({
        timezone: 'UTC',
        daily_question_enabled: false,
        daily_question_send_time: '00:00',
        daily_update_reminder_enabled: true,
        daily_update_reminder_time: currentClock,
        personal_channel_owner_id: 'UOWNER',
        personal_channel_id: 'C123',
      }),
      claimScheduledJob: (jobName, localDate) => {
        const key = `${jobName}:${localDate}`;
        if (claimedJobs.has(key)) {
          return false;
        }
        claimedJobs.add(key);
        return true;
      },
      hasDailyUpdateOnDate: () => false,
      getRecentDailyQuestionTexts: () => [],
      recordDailyQuestion: mock.fn(),
      completeScheduledJob: mock.fn(),
      failScheduledJob: mock.fn(),
    };

    const client = {
      conversations: {
        open: mock.fn(async () => ({ channel: { id: 'D123' } })),
      },
      chat: {
        postMessage: mock.fn(async () => {
          directMessageCount += 1;
          return { ts: '111.222' };
        }),
      },
    };

    const scheduler = createScheduler({
      store,
      aiService: {
        generateDailyQuestion: mock.fn(),
      },
      client,
      logger: {
        error: mock.fn(),
      },
      environment: {
        pollIntervalSeconds: 1,
      },
    });

    await scheduler.tick();
    await scheduler.tick();

    assert.equal(directMessageCount, 1);
    assert.equal(client.conversations.open.mock.callCount(), 1);
    assert.equal(client.chat.postMessage.mock.callCount(), 1);
  });

  it('does not send a separate Daily Question when it is included in the Daily Update', async () => {
    const now = DateTime.utc();
    const currentClock = now.setZone('UTC').toFormat('HH:mm');
    const claimedJobs = new Set();
    const postMessages = [];

    const store = {
      getSettings: () => ({
        timezone: 'UTC',
        daily_question_enabled: true,
        daily_question_send_time: currentClock,
        daily_question_include_in_daily_update: true,
        daily_question_prompt: 'Ask a fun question about today.',
        daily_question_reply_text: 'Reply to this message in a thread!',
        daily_update_reminder_enabled: false,
        daily_update_reminder_time: '00:00',
        personal_channel_owner_id: 'UOWNER',
        personal_channel_id: 'C123',
        daily_update_ping_user_group_id: 'S123',
      }),
      claimScheduledJob: (jobName, localDate) => {
        const key = `${jobName}:${localDate}`;
        if (claimedJobs.has(key)) {
          return false;
        }
        claimedJobs.add(key);
        return true;
      },
      hasDailyUpdateOnDate: () => false,
      getRecentDailyQuestionTexts: () => [],
      recordDailyQuestion: mock.fn(),
      completeScheduledJob: mock.fn(),
      failScheduledJob: mock.fn(),
    };

    const client = {
      chat: {
        postMessage: mock.fn(async (payload) => {
          postMessages.push(payload);
          return { ts: '222.333' };
        }),
      },
    };

    const scheduler = createScheduler({
      store,
      aiService: {
        generateDailyQuestion: mock.fn(async () => ({
          questionText: 'What are you building this week?',
          questionHash: 'abc123',
        })),
      },
      client,
      logger: {
        error: mock.fn(),
      },
      environment: {
        pollIntervalSeconds: 1,
      },
    });

    await scheduler.tick();

    assert.equal(postMessages.length, 0);
    assert.equal(store.recordDailyQuestion.mock.callCount(), 1);
    const recorded = store.recordDailyQuestion.mock.calls[0].arguments[0];
    assert.equal(recorded.messageTs, null);
    assert.equal(recorded.sentAtUtc, null);
    const completed = store.completeScheduledJob.mock.calls[0].arguments[2];
    assert.equal(completed.skipped, true);
    assert.equal(completed.reason, 'included-in-daily-update');
  });

  it('sends the Daily Question as a separate message when it is not included in the Daily Update', async () => {
    const now = DateTime.utc();
    const currentClock = now.setZone('UTC').toFormat('HH:mm');
    const claimedJobs = new Set();
    const postMessages = [];

    const store = {
      getSettings: () => ({
        timezone: 'UTC',
        daily_question_enabled: true,
        daily_question_send_time: currentClock,
        daily_question_include_in_daily_update: false,
        daily_question_prompt: 'Ask a fun question about today.',
        daily_question_reply_text: 'Reply to this message in a thread!',
        daily_update_reminder_enabled: false,
        daily_update_reminder_time: '00:00',
        personal_channel_owner_id: 'UOWNER',
        personal_channel_id: 'C123',
        daily_update_ping_user_group_id: 'S123',
      }),
      claimScheduledJob: (jobName, localDate) => {
        const key = `${jobName}:${localDate}`;
        if (claimedJobs.has(key)) {
          return false;
        }
        claimedJobs.add(key);
        return true;
      },
      hasDailyUpdateOnDate: () => false,
      getRecentDailyQuestionTexts: () => [],
      recordDailyQuestion: mock.fn(),
      completeScheduledJob: mock.fn(),
      failScheduledJob: mock.fn(),
    };

    const client = {
      chat: {
        postMessage: mock.fn(async (payload) => {
          postMessages.push(payload);
          return { ts: '222.333' };
        }),
      },
    };

    const scheduler = createScheduler({
      store,
      aiService: {
        generateDailyQuestion: mock.fn(async () => ({
          questionText: 'What are you building this week?',
          questionHash: 'abc123',
        })),
      },
      client,
      logger: {
        error: mock.fn(),
      },
      environment: {
        pollIntervalSeconds: 1,
      },
    });

    await scheduler.tick();

    assert.equal(postMessages.length, 1);
    assert(postMessages[0].text.includes('❓ Daily Question'));
    assert(postMessages[0].text.includes('Reply to this message in a thread!'));
    assert(!postMessages[0].text.includes('<!subteam^S123>'));
    assert.equal(store.recordDailyQuestion.mock.callCount(), 1);
  });
});
