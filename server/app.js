import express from 'express';
import { cors, securityHeaders } from './utils/http.js';

export function createApp({ config, feed, sseHub, logger }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cors(config.corsOrigins));

  app.get('/api/health', (req, res) => {
    const snapshot = feed.getSnapshot();
    res.json({
      status: 'ok',
      hasSnapshot: Boolean(snapshot),
      updatedAt: snapshot ? new Date(snapshot.updatedAt).toISOString() : null,
      sseClients: sseHub.size,
    });
  });

  app.get('/api/feed/snapshot', (req, res) => {
    const snapshot = feed.getSnapshot();
    if (!snapshot) {
      res.set('Retry-After', '5');
      res.status(503).json({ error: 'Market data is not available yet. Try again shortly.' });
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.json({ assets: snapshot.assets });
  });

  app.get('/api/feed/stream', (req, res) => {
    sseHub.connect(req, res, feed.getSnapshot()?.assets);
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    logger.error('request_failed', { path: req.path, reason: error.message });
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
