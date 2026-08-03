import { App, LogLevel } from '@slack/bolt';
import { createHomeHandlers } from './app-home/handlers.js';
import { loadEnvironment } from './config/env.js';
import { createStore } from './database/store.js';
import { createScheduler } from './scheduler.js';
import { createHackClubAiService } from './services/ai.js';

function getLogLevel(logLevel) {
  const normalizedLevel = (logLevel || 'info').toLowerCase();
  if (normalizedLevel === 'debug') return LogLevel.DEBUG;
  if (normalizedLevel === 'warn') return LogLevel.WARN;
  if (normalizedLevel === 'error') return LogLevel.ERROR;
  return LogLevel.INFO;
}

export async function createAsteriaRuntime() {
  const environment = loadEnvironment();
  const store = await createStore(environment.databasePath, {
    ownerId: environment.personalChannelOwnerId,
    channelId: environment.personalChannelId,
  });

  const app = new App({
    token: environment.slackBotToken,
    appToken: environment.slackAppToken,
    signingSecret: environment.slackSigningSecret,
    socketMode: true,
    logLevel: getLogLevel(environment.logLevel),
  });

  const logger = app.logger;
  const aiService = createHackClubAiService({
    apiKey: environment.hackClubAiKey,
    baseUrl: environment.hackClubAiBaseUrl,
    model: environment.hackClubAiModel,
    logger,
  });

  const scheduler = createScheduler({
    store,
    aiService,
    client: app.client,
    logger,
    environment,
  });

  createHomeHandlers({
    app,
    store,
    aiService,
    environment,
    scheduler,
  });

  app.error(async (error) => {
    logger.error('Unhandled Bolt error', error);
  });

  return {
    app,
    environment,
    store,
    scheduler,
  };
}
