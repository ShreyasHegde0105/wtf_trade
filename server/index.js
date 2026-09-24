import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createVolumeCache } from './cache/volumeCache.js';
import { loadConfig } from './config.js';
import { createCoinGeckoClient } from './services/coingecko.js';
import { createFeedService } from './services/feed.js';
import { createProviders } from './services/providers/index.js';
import { createSseHub } from './services/sseHub.js';
import { logger } from './utils/logger.js';

export function startServer(config = loadConfig(), { fetchImpl } = {}) {
  const client = createCoinGeckoClient(config.coingecko, fetchImpl);
  const volumeCache = createVolumeCache({
    fetchVolumeHistory: client.fetchVolumeHistory,
    ttlMs: config.feed.volumeTtlMs,
    requestDelayMs: config.feed.volumeRequestDelayMs,
    logger,
  });
  const providers = createProviders({ config, client, volumeCache, logger });
  const feed = createFeedService({
    providers,
    topN: config.feed.topN,
    pollIntervalMs: config.feed.pollIntervalMs,
    logger,
  });
  const sseHub = createSseHub({
    heartbeatMs: config.feed.heartbeatMs,
    maxClients: config.feed.maxSseClients,
    logger,
  });
  feed.subscribe(sseHub.broadcast);

  const app = createApp({ config, feed, sseHub, logger });
  const server = app.listen(config.port, () => {
    logger.info('server_started', {
      port: server.address().port,
      env: config.nodeEnv,
      pollIntervalMs: config.feed.pollIntervalMs,
      providers: providers.map((provider) => provider.name),
    });
  });
  feed.start();

  async function stop() {
    feed.stop();
    sseHub.closeAll();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  return { server, feed, sseHub, stop };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const runtime = startServer();
  const shutdown = (signal) => {
    logger.info('server_stopping', { signal });
    runtime.stop().then(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
