import { sendDailyQuestion, sendDirectMessage } from "./services/slack.js";
import { getLocalDateKey, isDueAtClock } from "./utils/time.js";

function splitTopicsText(topicText) {
  return String(topicText || "")
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);
}

function buildQuestionJobKey(localDate) {
  return `daily-question:${localDate}`;
}

function buildReminderJobKey(localDate) {
  return `daily-reminder:${localDate}`;
}

export function createScheduler({
  store,
  aiService,
  client,
  logger,
  environment,
}) {
  let timer = null;
  let isTickRunning = false;

  async function runDailyQuestion(settings, localDate) {
    if (!settings.daily_question_enabled || !settings.personal_channel_id) {
      return;
    }

    const jobKey = buildQuestionJobKey(localDate);
    if (
      !store.claimScheduledJob(jobKey, localDate, { type: "daily-question" })
    ) {
      return;
    }

    const combinedTopics = [
      ...new Set([
        ...(settings.daily_question_topics || []),
        ...splitTopicsText(settings.daily_question_custom_topics_text),
      ]),
    ];
    const topicsForPrompt =
      combinedTopics.length > 0
        ? combinedTopics
        : [
            "fun",
            "school",
            "technology",
            "creativity",
            "music",
            "food",
            "hobbies",
            "random",
          ];

    try {
      const recentQuestions = store.getRecentDailyQuestionTexts(5);
      const aiResult = await aiService.generateDailyQuestion({
        topics: topicsForPrompt,
        tone: settings.daily_question_tone,
        customInstructions: settings.daily_question_custom_instructions,
        recentQuestions,
      });

      const response = await sendDailyQuestion(
        client,
        settings,
        aiResult.questionText,
      );
      store.recordDailyQuestion({
        localDate,
        questionText: aiResult.questionText,
        topics: combinedTopics,
        tone: settings.daily_question_tone,
        customInstructions: settings.daily_question_custom_instructions,
        questionHash: aiResult.questionHash,
        messageTs: response.messageTs,
        sentAtUtc: new Date().toISOString(),
      });

      store.completeScheduledJob(jobKey, localDate, {
        messageTs: response.messageTs,
        questionText: aiResult.questionText,
      });
    } catch (error) {
      logger.error("Daily Question job failed", error);
      store.failScheduledJob(
        jobKey,
        localDate,
        error instanceof Error ? error.message : String(error),
        {},
      );
    }
  }

  async function runDailyReminder(settings, localDate) {
    if (
      !settings.daily_update_reminder_enabled ||
      !settings.personal_channel_owner_id
    ) {
      return;
    }

    const jobKey = buildReminderJobKey(localDate);
    if (
      !store.claimScheduledJob(jobKey, localDate, { type: "daily-reminder" })
    ) {
      return;
    }

    if (store.hasDailyUpdateOnDate(localDate)) {
      store.completeScheduledJob(jobKey, localDate, {
        skipped: true,
        reason: "daily-update-already-sent",
      });
      return;
    }

    try {
      await sendDirectMessage(
        client,
        settings.personal_channel_owner_id,
        "You have not sent your Daily Update yet today. Open Asteria's App Home to write and send it.",
      );
      store.completeScheduledJob(jobKey, localDate, { sent: true });
    } catch (error) {
      logger.error("Daily reminder job failed", error);
      store.failScheduledJob(
        jobKey,
        localDate,
        error instanceof Error ? error.message : String(error),
        {},
      );
    }
  }

  async function tick() {
    if (isTickRunning) {
      return;
    }

    isTickRunning = true;

    try {
      const settings = store.getSettings();
      const now = new Date();
      const localDate = getLocalDateKey(now, settings.timezone);

      if (
        isDueAtClock(now, settings.timezone, settings.daily_question_send_time)
      ) {
        await runDailyQuestion(settings, localDate);
      }

      if (
        isDueAtClock(
          now,
          settings.timezone,
          settings.daily_update_reminder_time,
        )
      ) {
        await runDailyReminder(settings, localDate);
      }
    } catch (error) {
      logger.error("Scheduler tick failed", error);
    } finally {
      isTickRunning = false;
    }
  }

  function start() {
    if (timer) {
      return;
    }

    void tick();
    timer = setInterval(() => {
      void tick();
    }, environment.pollIntervalSeconds * 1000);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    tick,
  };
}
