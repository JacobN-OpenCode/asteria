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
  };
}
