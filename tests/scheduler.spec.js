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
});
