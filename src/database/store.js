import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { getDefaultQuestionTopics, normalizeTimeValue } from '../utils/time.js';

const DEFAULT_SETTINGS = {
  personal_channel_owner_id: '',
  personal_channel_id: '',
  timezone: 'UTC',
  bot_display_name: 'Asteria',
  daily_question_enabled: 1,
  daily_question_topics_json: JSON.stringify(getDefaultQuestionTopics()),
  daily_question_tone: 'friendly and curious',
  daily_question_custom_instructions: '',
  daily_question_custom_topics_text: '',
  daily_question_include_in_daily_update: 0,
  daily_question_send_time: '09:00',
  daily_question_reply_text: 'Reply to this message in a thread!',
  welcomer_enabled: 1,
  welcome_message_content: 'Welcome {user}! 🎉\n\nPlease make yourself at home.',
  rules_canvas_url: '',
  daily_update_ping_user_group_id: '',
  daily_update_thread_enabled: 0,
  daily_update_thread_message: ':thread: here please!!',
  daily_update_reminder_enabled: 1,
  daily_update_reminder_time: '17:00',
  updated_at: new Date().toISOString(),
};

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toBooleanInteger(value) {
  return value ? 1 : 0;
}

function parseBoolean(value) {
  return value === 1 || value === '1' || value === true;
}

function parseJsonArray(text, fallback = []) {
  if (!text) {
    return fallback;
  }

  try {
    const parsedValue = JSON.parse(text);
    if (Array.isArray(parsedValue)) {
      return parsedValue;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function sanitizeSettingsPatch(patch) {
  const sanitizedPatch = { ...patch };

  if (sanitizedPatch.timezone) {
    sanitizedPatch.timezone = sanitizedPatch.timezone.trim();
  }

  if ('bot_display_name' in sanitizedPatch) {
    sanitizedPatch.bot_display_name = sanitizedPatch.bot_display_name.trim() || 'Asteria';
  }

  if (sanitizedPatch.daily_question_send_time) {
    sanitizedPatch.daily_question_send_time = normalizeTimeValue(sanitizedPatch.daily_question_send_time, '09:00');
  }

  if (sanitizedPatch.daily_update_reminder_time) {
    sanitizedPatch.daily_update_reminder_time = normalizeTimeValue(sanitizedPatch.daily_update_reminder_time, '17:00');
  }

  if (typeof sanitizedPatch.daily_question_custom_topics_text === 'string') {
    sanitizedPatch.daily_question_custom_topics_text = sanitizedPatch.daily_question_custom_topics_text.trim();
  }

  if (Array.isArray(sanitizedPatch.daily_question_topics)) {
    sanitizedPatch.daily_question_topics_json = JSON.stringify(sanitizedPatch.daily_question_topics);
    delete sanitizedPatch.daily_question_topics;
  }

  for (const booleanKey of [
    'daily_question_enabled',
    'daily_question_include_in_daily_update',
    'welcomer_enabled',
    'daily_update_thread_enabled',
    'daily_update_reminder_enabled',
  ]) {
    if (booleanKey in sanitizedPatch) {
      sanitizedPatch[booleanKey] = toBooleanInteger(sanitizedPatch[booleanKey]);
    }
  }

  if (sanitizedPatch.daily_question_reply_text) {
    sanitizedPatch.daily_question_reply_text = sanitizedPatch.daily_question_reply_text.trim();
  }

  return sanitizedPatch;
}

function bindAndFetchAll(database, sql, params = {}) {
  const statement = database.prepare(sql);
  try {
    statement.bind(normalizeParams(params));
    const rows = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    return rows;
  } finally {
    statement.free();
  }
}

function bindAndFetchOne(database, sql, params = {}) {
  return bindAndFetchAll(database, sql, params)[0] ?? null;
}

function bindAndRun(database, sql, params = {}) {
  const statement = database.prepare(sql);
  try {
    statement.bind(normalizeParams(params));
    while (statement.step()) {
      // consume the statement
    }
  } finally {
    statement.free();
  }
}

function getRowsChanged(database) {
  return bindAndFetchOne(database, 'SELECT changes() AS changes')?.changes ?? 0;
}

function normalizeParams(params) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (key.startsWith('$') || key.startsWith(':') || key.startsWith('@')) {
        return [key, value];
      }

      return [`$${key}`, value];
    }),
  );
}

export async function createStore(databasePath, options = {}) {
  ensureDirectoryForFile(databasePath);

  const sqlJsDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../node_modules/sql.js/dist');
  const SQL = await initSqlJs({
    locateFile: (fileName) => path.join(sqlJsDistDir, fileName),
  });

  const databaseBytes = fs.existsSync(databasePath) ? fs.readFileSync(databasePath) : null;
  const database = databaseBytes ? new SQL.Database(databaseBytes) : new SQL.Database();

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      personal_channel_owner_id TEXT NOT NULL DEFAULT '',
      personal_channel_id TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      bot_display_name TEXT NOT NULL DEFAULT 'Asteria',
      daily_question_enabled INTEGER NOT NULL DEFAULT 1,
      daily_question_topics_json TEXT NOT NULL DEFAULT '[]',
      daily_question_tone TEXT NOT NULL DEFAULT 'friendly and curious',
      daily_question_custom_instructions TEXT NOT NULL DEFAULT '',
      daily_question_custom_topics_text TEXT NOT NULL DEFAULT '',
      daily_question_include_in_daily_update INTEGER NOT NULL DEFAULT 0,
      daily_question_send_time TEXT NOT NULL DEFAULT '09:00',
      daily_question_reply_text TEXT NOT NULL DEFAULT 'Reply to this message in a thread!',
      welcomer_enabled INTEGER NOT NULL DEFAULT 1,
      welcome_message_content TEXT NOT NULL DEFAULT 'Welcome {user}! 🎉\n\nPlease make yourself at home.',
      rules_canvas_url TEXT NOT NULL DEFAULT '',
      daily_update_ping_user_group_id TEXT NOT NULL DEFAULT '',
      daily_update_thread_enabled INTEGER NOT NULL DEFAULT 0,
      daily_update_thread_message TEXT NOT NULL DEFAULT ':thread: here please!!',
      daily_update_reminder_enabled INTEGER NOT NULL DEFAULT 1,
      daily_update_reminder_time TEXT NOT NULL DEFAULT '17:00',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_update_drafts (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      main_update_text TEXT NOT NULL DEFAULT '',
      song_text TEXT NOT NULL DEFAULT '',
      event_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_update_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sent_at_utc TEXT NOT NULL,
      local_date TEXT NOT NULL,
      message_ts TEXT NOT NULL,
      thread_ts TEXT,
      main_update_text TEXT NOT NULL,
      song_text TEXT NOT NULL DEFAULT '',
      event_text TEXT NOT NULL DEFAULT '',
      question_text TEXT NOT NULL DEFAULT '',
      user_group_id TEXT NOT NULL DEFAULT '',
      sent_by_user_id TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS daily_question_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_date TEXT NOT NULL,
      question_text TEXT NOT NULL,
      topics_json TEXT NOT NULL,
      tone TEXT NOT NULL,
      custom_instructions TEXT NOT NULL DEFAULT '',
      question_hash TEXT NOT NULL,
      message_ts TEXT,
      generated_at_utc TEXT NOT NULL,
      sent_at_utc TEXT
    );

    CREATE TABLE IF NOT EXISTS scheduled_job_runs (
      job_name TEXT NOT NULL,
      local_date TEXT NOT NULL,
      status TEXT NOT NULL,
      claimed_at_utc TEXT NOT NULL,
      completed_at_utc TEXT,
      error_text TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (job_name, local_date)
    );

    CREATE TABLE IF NOT EXISTS welcome_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_ts TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      sent_at_utc TEXT NOT NULL,
      message_ts TEXT NOT NULL,
      UNIQUE(event_ts, channel_id, user_id)
    );
  `);

  const existingSettingColumns = bindAndFetchAll(database, 'PRAGMA table_info(app_settings)').map(
    (column) => column.name,
  );
  if (!existingSettingColumns.includes('bot_display_name')) {
    bindAndRun(database, "ALTER TABLE app_settings ADD COLUMN bot_display_name TEXT NOT NULL DEFAULT 'Asteria'");
  }

  bindAndRun(
    database,
    `
    INSERT OR IGNORE INTO app_settings (
      id,
      personal_channel_owner_id,
      personal_channel_id,
      timezone,
      bot_display_name,
      daily_question_enabled,
      daily_question_topics_json,
      daily_question_tone,
      daily_question_custom_instructions,
      daily_question_custom_topics_text,
      daily_question_include_in_daily_update,
      daily_question_send_time,
      daily_question_reply_text,
      welcomer_enabled,
      welcome_message_content,
      rules_canvas_url,
      daily_update_ping_user_group_id,
      daily_update_thread_enabled,
      daily_update_thread_message,
      daily_update_reminder_enabled,
      daily_update_reminder_time,
      updated_at
    ) VALUES (
      1,
      $personal_channel_owner_id,
      $personal_channel_id,
      $timezone,
      $bot_display_name,
      $daily_question_enabled,
      $daily_question_topics_json,
      $daily_question_tone,
      $daily_question_custom_instructions,
      $daily_question_custom_topics_text,
      $daily_question_include_in_daily_update,
      $daily_question_send_time,
      $daily_question_reply_text,
      $welcomer_enabled,
      $welcome_message_content,
      $rules_canvas_url,
      $daily_update_ping_user_group_id,
      $daily_update_thread_enabled,
      $daily_update_thread_message,
      $daily_update_reminder_enabled,
      $daily_update_reminder_time,
      $updated_at
    )
  `,
    DEFAULT_SETTINGS,
  );

  bindAndRun(
    database,
    `
    INSERT OR IGNORE INTO daily_update_drafts (id, main_update_text, song_text, event_text, created_at, updated_at)
    VALUES (1, '', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `,
  );

  const persist = () => {
    fs.writeFileSync(databasePath, Buffer.from(database.export()));
  };

  const getSettingsRow = () => bindAndFetchOne(database, 'SELECT * FROM app_settings WHERE id = 1');
  const updateSettingsRow = (params) => {
    bindAndRun(
      database,
      `
      UPDATE app_settings SET
        personal_channel_owner_id = $personal_channel_owner_id,
        personal_channel_id = $personal_channel_id,
        timezone = $timezone,
        bot_display_name = $bot_display_name,
        daily_question_enabled = $daily_question_enabled,
        daily_question_topics_json = $daily_question_topics_json,
        daily_question_tone = $daily_question_tone,
        daily_question_custom_instructions = $daily_question_custom_instructions,
        daily_question_custom_topics_text = $daily_question_custom_topics_text,
        daily_question_include_in_daily_update = $daily_question_include_in_daily_update,
        daily_question_send_time = $daily_question_send_time,
        daily_question_reply_text = $daily_question_reply_text,
        welcomer_enabled = $welcomer_enabled,
        welcome_message_content = $welcome_message_content,
        rules_canvas_url = $rules_canvas_url,
        daily_update_ping_user_group_id = $daily_update_ping_user_group_id,
        daily_update_thread_enabled = $daily_update_thread_enabled,
        daily_update_thread_message = $daily_update_thread_message,
        daily_update_reminder_enabled = $daily_update_reminder_enabled,
        daily_update_reminder_time = $daily_update_reminder_time,
        updated_at = $updated_at
      WHERE id = 1
    `,
      params,
    );
    persist();
  };

  const getDraftRow = () => bindAndFetchOne(database, 'SELECT * FROM daily_update_drafts WHERE id = 1');
  const upsertDraftRow = (params) => {
    bindAndRun(
      database,
      `
      INSERT INTO daily_update_drafts (id, main_update_text, song_text, event_text, created_at, updated_at)
      VALUES (1, $main_update_text, $song_text, $event_text, $created_at, $updated_at)
      ON CONFLICT(id) DO UPDATE SET
        main_update_text = excluded.main_update_text,
        song_text = excluded.song_text,
        event_text = excluded.event_text,
        updated_at = excluded.updated_at
    `,
      params,
    );
    persist();
  };

  const insertDailyUpdateRow = (params) => {
    bindAndRun(
      database,
      `
      INSERT INTO daily_update_history (
        sent_at_utc,
        local_date,
        message_ts,
        thread_ts,
        main_update_text,
        song_text,
        event_text,
        question_text,
        user_group_id,
        sent_by_user_id
      ) VALUES (
        $sent_at_utc,
        $local_date,
        $message_ts,
        $thread_ts,
        $main_update_text,
        $song_text,
        $event_text,
        $question_text,
        $user_group_id,
        $sent_by_user_id
      )
    `,
      params,
    );
    persist();
  };

  const insertDailyQuestionRow = (params) => {
    bindAndRun(
      database,
      `
      INSERT INTO daily_question_history (
        local_date,
        question_text,
        topics_json,
        tone,
        custom_instructions,
        question_hash,
        message_ts,
        generated_at_utc,
        sent_at_utc
      ) VALUES (
        $local_date,
        $question_text,
        $topics_json,
        $tone,
        $custom_instructions,
        $question_hash,
        $message_ts,
        $generated_at_utc,
        $sent_at_utc
      )
    `,
      params,
    );
    persist();
  };

  const claimJobRow = (params) => {
    bindAndRun(
      database,
      `
      INSERT OR IGNORE INTO scheduled_job_runs (job_name, local_date, status, claimed_at_utc, payload_json)
      VALUES ($job_name, $local_date, $status, $claimed_at_utc, $payload_json)
    `,
      params,
    );
    const changes = getRowsChanged(database);
    persist();
    return changes > 0;
  };

  const updateJobRow = (params) => {
    bindAndRun(
      database,
      `
      UPDATE scheduled_job_runs SET
        status = $status,
        completed_at_utc = $completed_at_utc,
        error_text = $error_text,
        payload_json = $payload_json
      WHERE job_name = $job_name AND local_date = $local_date
    `,
      params,
    );
    persist();
  };

  const insertWelcomeEvent = (params) => {
    bindAndRun(
      database,
      `
      INSERT OR IGNORE INTO welcome_events (event_ts, channel_id, user_id, sent_at_utc, message_ts)
      VALUES ($event_ts, $channel_id, $user_id, $sent_at_utc, $message_ts)
    `,
      params,
    );
    const changes = getRowsChanged(database);
    persist();
    return changes > 0;
  };

  const store = {
    getSettings() {
      const settingsRow = getSettingsRow();
      return {
        ...settingsRow,
        daily_question_enabled: parseBoolean(settingsRow.daily_question_enabled),
        daily_question_topics: parseJsonArray(settingsRow.daily_question_topics_json, getDefaultQuestionTopics()),
        daily_question_include_in_daily_update: parseBoolean(settingsRow.daily_question_include_in_daily_update),
        welcomer_enabled: parseBoolean(settingsRow.welcomer_enabled),
        daily_update_thread_enabled: parseBoolean(settingsRow.daily_update_thread_enabled),
        daily_update_reminder_enabled: parseBoolean(settingsRow.daily_update_reminder_enabled),
      };
    },

    updateSettings(patch) {
      const currentSettings = this.getSettings();
      const mergedSettings = sanitizeSettingsPatch({
        ...currentSettings,
        ...patch,
        updated_at: new Date().toISOString(),
      });
      updateSettingsRow(mergedSettings);
      return this.getSettings();
    },

    getDraft() {
      return getDraftRow();
    },

    saveDraft(payload = {}) {
      const mainUpdateText = payload.mainUpdateText ?? payload.main_update_text ?? '';
      const songText = payload.songText ?? payload.song_text ?? '';
      const eventText = payload.eventText ?? payload.event_text ?? '';
      const existingDraft = getDraftRow();
      const nowIso = new Date().toISOString();
      upsertDraftRow({
        $main_update_text: mainUpdateText,
        $song_text: songText,
        $event_text: eventText,
        $created_at: existingDraft?.created_at ?? nowIso,
        $updated_at: nowIso,
      });
      return getDraftRow();
    },

    clearDraft() {
      const nowIso = new Date().toISOString();
      upsertDraftRow({
        $main_update_text: '',
        $song_text: '',
        $event_text: '',
        $created_at: getDraftRow()?.created_at ?? nowIso,
        $updated_at: nowIso,
      });
      return getDraftRow();
    },

    recordDailyUpdateSend(payload) {
      insertDailyUpdateRow(payload);
    },

    hasDailyUpdateOnDate(localDate) {
      const row = bindAndFetchOne(
        database,
        'SELECT COUNT(1) AS count FROM daily_update_history WHERE local_date = $local_date',
        { $local_date: localDate },
      );
      return row.count > 0;
    },

    getRecentDailyQuestionTexts(limit = 5) {
      const rows = bindAndFetchAll(
        database,
        'SELECT question_text FROM daily_question_history ORDER BY id DESC LIMIT $limit',
        { $limit: limit },
      );
      return rows.map((row) => row.question_text);
    },

    getLastDailyQuestion() {
      return bindAndFetchOne(database, 'SELECT * FROM daily_question_history ORDER BY id DESC LIMIT 1');
    },

    recordDailyQuestion({
      localDate,
      questionText,
      topics,
      tone,
      customInstructions,
      questionHash,
      messageTs = null,
      sentAtUtc = null,
    }) {
      insertDailyQuestionRow({
        $local_date: localDate,
        $question_text: questionText,
        $topics_json: JSON.stringify(topics),
        $tone: tone,
        $custom_instructions: customInstructions,
        $question_hash: questionHash,
        $message_ts: messageTs,
        $generated_at_utc: new Date().toISOString(),
        $sent_at_utc: sentAtUtc,
      });
    },

    claimScheduledJob(jobName, localDate, payload = {}) {
      return claimJobRow({
        $job_name: jobName,
        $local_date: localDate,
        $status: 'claimed',
        $claimed_at_utc: new Date().toISOString(),
        $payload_json: JSON.stringify(payload),
      });
    },

    completeScheduledJob(jobName, localDate, payload = {}) {
      updateJobRow({
        $job_name: jobName,
        $local_date: localDate,
        $status: 'completed',
        $completed_at_utc: new Date().toISOString(),
        $error_text: null,
        $payload_json: JSON.stringify(payload),
      });
    },

    failScheduledJob(jobName, localDate, errorText, payload = {}) {
      updateJobRow({
        $job_name: jobName,
        $local_date: localDate,
        $status: 'failed',
        $completed_at_utc: new Date().toISOString(),
        $error_text: errorText,
        $payload_json: JSON.stringify(payload),
      });
    },

    getScheduledJob(jobName, localDate) {
      return bindAndFetchOne(
        database,
        'SELECT * FROM scheduled_job_runs WHERE job_name = $job_name AND local_date = $local_date',
        {
          $job_name: jobName,
          $local_date: localDate,
        },
      );
    },

    recordWelcomeEvent({ eventTs, channelId, userId, messageTs }) {
      return insertWelcomeEvent({
        $event_ts: eventTs,
        $channel_id: channelId,
        $user_id: userId,
        $sent_at_utc: new Date().toISOString(),
        $message_ts: messageTs,
      });
    },

    hasWelcomeEvent({ eventTs, channelId, userId }) {
      const row = bindAndFetchOne(
        database,
        'SELECT COUNT(1) AS count FROM welcome_events WHERE event_ts = $event_ts AND channel_id = $channel_id AND user_id = $user_id',
        {
          $event_ts: eventTs,
          $channel_id: channelId,
          $user_id: userId,
        },
      );

      return row.count > 0;
    },

    close() {
      persist();
      database.close();
    },
  };

  const { ownerId = '', channelId = '' } = options;
  const currentSettings = store.getSettings();
  const seedPatch = {};
  if (!currentSettings.personal_channel_owner_id && ownerId) {
    seedPatch.personal_channel_owner_id = ownerId;
  }
  if (!currentSettings.personal_channel_id && channelId) {
    seedPatch.personal_channel_id = channelId;
  }
  if (Object.keys(seedPatch).length > 0) {
    store.updateSettings(seedPatch);
  }

  return store;
}
