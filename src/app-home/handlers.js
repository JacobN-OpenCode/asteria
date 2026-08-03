import {
  fetchUserGroups,
  sendDailyUpdate,
  sendWelcomeMessage,
} from "../services/slack.js";
import { formatDailyQuestionMessage } from "../utils/messages.js";
import {
  getDefaultQuestionTopics,
  getLocalDateKey,
  isValidTimeZone,
  normalizeTimeValue,
} from "../utils/time.js";
import { buildHomeView } from "./views.js";

function getInputValue(viewState, blockId, actionId) {
  return viewState?.[blockId]?.[actionId]?.value ?? "";
}

function getCheckboxEnabled(viewState, blockId, actionId) {
  return (viewState?.[blockId]?.[actionId]?.selected_options ?? []).length > 0;
}

function getStaticSelectValue(viewState, blockId, actionId) {
  return viewState?.[blockId]?.[actionId]?.selected_option?.value ?? "";
}

function getConversationSelectValue(viewState, blockId, actionId) {
  return viewState?.[blockId]?.[actionId]?.selected_conversation ?? "";
}

function getMultiSelectValues(viewState, blockId, actionId) {
  return (viewState?.[blockId]?.[actionId]?.selected_options ?? []).map(
    (option) => option.value,
  );
}

async function publishHome(client, userId, view) {
  await client.views.publish({
    user_id: userId,
    view,
  });
}

export function createHomeHandlers({ app, store }) {
  async function publishTab(client, userId, tab, notice = "") {
    const settings = store.getSettings();
    const draft = store.getDraft();
    const userGroups = await fetchUserGroups(client);
    const recentQuestions = store.getRecentDailyQuestionTexts(5);
    const lastQuestion = store.getLastDailyQuestion();
    const questionPreview =
      settings.daily_question_enabled && lastQuestion?.question_text
        ? formatDailyQuestionMessage(
            lastQuestion.question_text,
            settings.daily_question_reply_text,
          )
        : "";

    await publishHome(
      client,
      userId,
      buildHomeView({
        tab,
        settings,
        draft,
        questionPreview,
        recentQuestions,
        notice,
        userGroups,
        isOwner: userId === settings.personal_channel_owner_id,
      }),
    );
  }

  async function handleNavigation(tab, { ack, body, client }) {
    await ack();
    const settings = store.getSettings();
    const activeTab =
      body.user.id === settings.personal_channel_owner_id
        ? tab
        : "daily-update";
    await publishTab(client, body.user.id, activeTab);
  }

  async function handleSendDailyUpdate({ ack, body, client, logger }) {
    await ack();
    const settings = store.getSettings();

    if (body.user.id !== settings.personal_channel_owner_id) {
      await publishTab(
        client,
        body.user.id,
        "daily-update",
        ":warning: Only the configured owner can send the Daily Update.",
      );
      return;
    }

    const viewState = body.view.state.values;
    const draft = {
      main_update_text: getInputValue(
        viewState,
        "daily_update_main_block",
        "daily_update_main_text",
      ),
      song_text: getInputValue(
        viewState,
        "daily_update_song_block",
        "daily_update_song_text",
      ),
      event_text: getInputValue(
        viewState,
        "daily_update_event_block",
        "daily_update_event_text",
      ),
    };

    if (!draft.main_update_text.trim()) {
      store.saveDraft(draft);
      await publishTab(
        client,
        body.user.id,
        "daily-update",
        ":x: Daily Update needs a main message before it can be sent.",
      );
      return;
    }

    if (
      !settings.personal_channel_id ||
      !settings.daily_update_ping_user_group_id
    ) {
      store.saveDraft(draft);
      await publishTab(
        client,
        body.user.id,
        "daily-update",
        ":x: Configure the personal channel and Daily Update ping group first.",
      );
      return;
    }

    store.saveDraft(draft);

    try {
      const todayKey = getLocalDateKey(new Date(), settings.timezone);
      const lastQuestion = store.getLastDailyQuestion();
      const questionText =
        settings.daily_question_include_in_daily_update &&
        lastQuestion?.question_text
          ? lastQuestion.question_text
          : "";
      const sendResult = await sendDailyUpdate(
        client,
        settings,
        draft,
        questionText,
        { sentByUserId: body.user.id },
      );

      store.recordDailyUpdateSend({
        sent_at_utc: new Date().toISOString(),
        local_date: todayKey,
        message_ts: sendResult.messageTs,
        thread_ts: settings.daily_update_thread_enabled
          ? sendResult.threadTs
          : null,
        main_update_text: draft.main_update_text,
        song_text: draft.song_text,
        event_text: draft.event_text,
        question_text: questionText,
        user_group_id: settings.daily_update_ping_user_group_id,
        sent_by_user_id: body.user.id,
      });
      store.clearDraft();
      await publishTab(
        client,
        body.user.id,
        "daily-update",
        ":white_check_mark: Daily Update sent successfully.",
      );
    } catch (error) {
      logger.error("Failed to send Daily Update", error);
      await publishTab(
        client,
        body.user.id,
        "daily-update",
        ":x: Asteria could not send the Daily Update. Your draft was preserved.",
      );
    }
  }

  async function handleSaveDailyQuestionSettings({ ack, body, client }) {
    await ack();
    const settings = store.getSettings();
    if (body.user.id !== settings.personal_channel_owner_id) {
      await publishTab(
        client,
        body.user.id,
        "daily-question",
        ":warning: Only the configured owner can change Daily Question settings.",
      );
      return;
    }

    const viewState = body.view.state.values;
    const selectedTopics = getMultiSelectValues(
      viewState,
      "daily_question_topics_block",
      "daily_question_topics",
    );
    const customTopicsText = getInputValue(
      viewState,
      "daily_question_custom_topics_block",
      "daily_question_custom_topics",
    );

    store.updateSettings({
      daily_question_enabled: getCheckboxEnabled(
        viewState,
        "daily_question_enabled_block",
        "daily_question_enabled",
      ),
      daily_question_topics: selectedTopics,
      daily_question_tone:
        getInputValue(
          viewState,
          "daily_question_tone_block",
          "daily_question_tone",
        ) || "friendly and curious",
      daily_question_custom_instructions: getInputValue(
        viewState,
        "daily_question_custom_instructions_block",
        "daily_question_custom_instructions",
      ),
      daily_question_custom_topics_text: customTopicsText,
      daily_question_include_in_daily_update: getCheckboxEnabled(
        viewState,
        "daily_question_include_block",
        "daily_question_include_in_update",
      ),
      daily_question_send_time: normalizeTimeValue(
        getInputValue(
          viewState,
          "daily_question_send_time_block",
          "daily_question_send_time",
        ),
        settings.daily_question_send_time,
      ),
    });

    await publishTab(
      client,
      body.user.id,
      "daily-question",
      ":white_check_mark: Daily Question settings saved.",
    );
  }

  async function handleSaveWelcomerSettings({ ack, body, client }) {
    await ack();
    const settings = store.getSettings();
    if (body.user.id !== settings.personal_channel_owner_id) {
      await publishTab(
        client,
        body.user.id,
        "welcomer",
        ":warning: Only the configured owner can change Welcomer settings.",
      );
      return;
    }

    const viewState = body.view.state.values;
    const rulesCanvasUrl = getInputValue(
      viewState,
      "rules_canvas_block",
      "rules_canvas_url",
    ).trim();

    store.updateSettings({
      welcomer_enabled: getCheckboxEnabled(
        viewState,
        "welcomer_enabled_block",
        "welcomer_enabled",
      ),
      welcome_message_content: getInputValue(
        viewState,
        "welcome_message_block",
        "welcome_message_content",
      ),
      rules_canvas_url: rulesCanvasUrl,
    });

    await publishTab(
      client,
      body.user.id,
      "welcomer",
      ":white_check_mark: Welcomer settings saved.",
    );
  }

  async function handleSaveGeneralSettings({ ack, body, client }) {
    await ack();
    const settings = store.getSettings();
    if (body.user.id !== settings.personal_channel_owner_id) {
      await publishTab(
        client,
        body.user.id,
        "settings",
        ":warning: Only the configured owner can change general settings.",
      );
      return;
    }

    const viewState = body.view.state.values;
    const timezone = getInputValue(
      viewState,
      "timezone_block",
      "timezone",
    ).trim();
    const reminderTime = normalizeTimeValue(
      getInputValue(
        viewState,
        "daily_update_reminder_time_block",
        "daily_update_reminder_time",
      ),
      settings.daily_update_reminder_time,
    );
    const pingGroupId = getStaticSelectValue(
      viewState,
      "daily_update_ping_group_block",
      "daily_update_ping_user_group_id",
    );
    const personalChannelId = getConversationSelectValue(
      viewState,
      "personal_channel_block",
      "personal_channel_id",
    );

    if (!isValidTimeZone(timezone)) {
      await publishTab(
        client,
        body.user.id,
        "settings",
        ":x: Please enter a valid IANA timezone such as Europe/London or America/New_York.",
      );
      return;
    }

    store.updateSettings({
      timezone,
      daily_update_reminder_enabled: getCheckboxEnabled(
        viewState,
        "daily_update_reminder_enabled_block",
        "daily_update_reminder_enabled",
      ),
      daily_update_reminder_time: reminderTime,
      daily_update_ping_user_group_id: pingGroupId,
      personal_channel_id: personalChannelId,
    });

    await publishTab(
      client,
      body.user.id,
      "settings",
      ":white_check_mark: General settings saved.",
    );
  }

  async function handleAppHomeOpened({ event, client }) {
    if (event.tab !== "home") {
      return;
    }

    await publishTab(client, event.user, "daily-update");
  }

  async function handleMemberJoinedChannel({ event, client, logger }) {
    const settings = store.getSettings();
    if (
      !settings.welcomer_enabled ||
      !settings.personal_channel_id ||
      event.channel !== settings.personal_channel_id
    ) {
      return;
    }

    if (
      settings.personal_channel_owner_id &&
      event.user === settings.personal_channel_owner_id
    ) {
      return;
    }

    if (
      event.event_ts &&
      store.hasWelcomeEvent({
        eventTs: event.event_ts,
        channelId: event.channel,
        userId: event.user,
      })
    ) {
      return;
    }

    try {
      const response = await sendWelcomeMessage(client, settings, {
        userId: event.user,
      });
      if (event.event_ts) {
        store.recordWelcomeEvent({
          eventTs: event.event_ts,
          channelId: event.channel,
          userId: event.user,
          messageTs: response.ts,
        });
      }
    } catch (error) {
      logger.error("Failed to send welcome message", error);
    }
  }

  app.action("navigate_daily_update", (payload) =>
    handleNavigation("daily-update", payload),
  );
  app.action("navigate_daily_question", (payload) =>
    handleNavigation("daily-question", payload),
  );
  app.action("navigate_welcomer", (payload) =>
    handleNavigation("welcomer", payload),
  );
  app.action("navigate_settings", (payload) =>
    handleNavigation("settings", payload),
  );
  app.action("send_daily_update", handleSendDailyUpdate);
  app.action("save_daily_question_settings", handleSaveDailyQuestionSettings);
  app.action("save_welcomer_settings", handleSaveWelcomerSettings);
  app.action("save_general_settings", handleSaveGeneralSettings);
  app.event("app_home_opened", handleAppHomeOpened);
  app.event("member_joined_channel", handleMemberJoinedChannel);

  return {
    publishTab,
  };
}
