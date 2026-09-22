import { config as loadDotenv } from 'dotenv';

loadDotenv();

function requireValue(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parsePositiveInteger(value, fallback) {
  const parsedValue = Number.parseInt(value ?? '', 10);
  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  return fallback;
}

export function loadEnvironment() {
  return {
    slackBotToken: requireValue('SLACK_BOT_TOKEN'),
    slackAppToken: requireValue('SLACK_APP_TOKEN'),
    slackSigningSecret: requireValue('SLACK_SIGNING_SECRET'),
    personalChannelOwnerId: requireValue('PERSONAL_CHANNEL_OWNER_ID'),
    personalChannelId: requireValue('PERSONAL_CHANNEL_ID'),
    hackClubAiKey: requireValue('HACKCLUB_AI_KEY'),
    hackClubAiModel: process.env.HACKCLUB_AI_MODEL ?? 'qwen/qwen3-32b',
    hackClubAiBaseUrl: process.env.HACKCLUB_AI_BASE_URL ?? 'https://ai.hackclub.com/proxy/v1',
    databasePath: process.env.ASTERIA_DB_PATH ?? './data/asteria.sqlite',
    logLevel: (process.env.ASTERIA_LOG_LEVEL ?? 'info').toLowerCase(),
    pollIntervalSeconds: parsePositiveInteger(process.env.ASTERIA_POLL_INTERVAL_SECONDS, 60),
    todoistApiToken: process.env.TODOIST_API_TOKEN ?? '',
    slackListId: process.env.SLACK_SYNC_LIST_ID ?? '',
    todoistProjectName: process.env.TODOIST_PROJECT_NAME ?? 'Public Slack To Do List',
    notificationChannelId: process.env.SLACK_NOTIFICATION_CHANNEL_ID ?? '',
    syncEnabled: (process.env.TODOIST_SYNC_ENABLED ?? '') === 'true',
    syncPollIntervalSeconds: parsePositiveInteger(process.env.TODOIST_SYNC_POLL_INTERVAL_SECONDS, 300),
    todoistWebhookSecret: process.env.TODOIST_WEBHOOK_SECRET ?? '',
    todoistWebhookPort: parsePositiveInteger(process.env.ASTERIA_WEBHOOK_PORT, 8792),
    todoistApiBaseUrl: process.env.TODOIST_API_BASE_URL ?? 'https://api.todoist.com/api/v1',
  };
}
