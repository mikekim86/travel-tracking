import { createDefaultConfig, createTravelWatcherApp } from './app.ts';
import { log } from './logger.ts';

const config = createDefaultConfig();
const app = await createTravelWatcherApp(config);

const port = Number(process.env.PORT ?? '3000');
log('app', 'starting', {
  port,
  pollIntervalHours: config.pollIntervalHours,
  dataFile: config.dataFile,
  whatsappMode: config.whatsappMode,
});

app.server.on('error', (error) => {
  console.error('Failed to start HTTP server:', error);
  process.exitCode = 1;
});

app.server.listen(port, '127.0.0.1', () => {
  console.log(`Travel Redemption Watcher listening on http://localhost:${port}`);
  log('app', 'listening', { port });
});

app.scheduler.start(true);
