import { createAsteriaRuntime } from './src/asteria.js';

async function main() {
  const { app, scheduler, store, syncPoller, webhookServer, dashboardServer } = await createAsteriaRuntime();

  const dashboardPort = Number(process.env.ASTERIA_DASHBOARD_PORT || 8787);
  const dashboardHost = process.env.ASTERIA_DASHBOARD_HOST || '0.0.0.0';
  const shutdown = async () => {
    scheduler.stop();
    syncPoller.stop();
    webhookServer.stop();
    await dashboardServer.close().catch(() => {});
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
  await dashboardServer.listen(dashboardPort, dashboardHost);
  app.logger.info('Asteria is running in Socket Mode.');
}

main().catch((error) => {
  console.error('Asteria failed to start:', error);
  process.exit(1);
});
