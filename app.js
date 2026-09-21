import { createAsteriaRuntime } from './src/asteria.js';

async function main() {
  const { app, scheduler, store, syncPoller, webhookServer } = await createAsteriaRuntime();

  const shutdown = async () => {
    scheduler.stop();
    syncPoller.stop();
    webhookServer.stop();
    store.close();
    await app.stop().catch(() => {});
  };

  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });

  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });

  await app.start();
  scheduler.start();
  syncPoller.start();
  app.logger.info('Asteria is running in Socket Mode.');
}

main().catch((error) => {
  console.error('Asteria failed to start:', error);
  process.exit(1);
});
