import { createDefaultConfig, createTravelWatcherApp } from './app.ts';

const config = createDefaultConfig();
const app = await createTravelWatcherApp(config);

const port = Number(process.env.PORT ?? '3000');

app.server.on('error', (error) => {
  console.error('Failed to start HTTP server:', error);
  process.exitCode = 1;
});

app.server.listen(port, '127.0.0.1', () => {
  console.log(`Travel Redemption Watcher listening on http://localhost:${port}`);
});

app.scheduler.start(true);
