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

  app.get('/api/feed/discovery', (req, res) => {
    const snapshot = feed.getSnapshot();
    if (!snapshot) {
      res.set('Retry-After', '5');
      res.status(503).json({ error: 'Market data is not available yet. Try again shortly.' });
      return;
    }

    const { assets, _candidates: candidates } = snapshot;

    // trending: top 5 by momentum_score descending (assets are already sorted by momentum)
    const trending = assets.slice(0, 5);

    // gainers: top 5 by positive change_24h descending
    const gainers = assets
      .filter((a) => Number.isFinite(a.change_24h) && a.change_24h > 0)
      .sort((a, b) => b.change_24h - a.change_24h)
      .slice(0, 5);

    // volume_spikes: top 5 by volume_24h / avg_volume_7d descending
    // Build a lookup from candidates (which have avg_volume_7d) to compute the ratio,
    // then return the public asset shape (without exposing avg_volume_7d).
    const avgVolumeMap = new Map();
    if (candidates) {
      for (const c of candidates) {
        if (c.avg_volume_7d != null && Number.isFinite(c.avg_volume_7d) && c.avg_volume_7d > 0) {
          avgVolumeMap.set(c.id, c.avg_volume_7d);
        }
      }
    }

    const volume_spikes = assets
      .map((asset) => {
        const avg = avgVolumeMap.get(asset.id);
        const ratio = avg && Number.isFinite(asset.volume_24h) && asset.volume_24h > 0
          ? asset.volume_24h / avg
          : 0;
        return { asset, ratio };
      })
      .filter((entry) => Number.isFinite(entry.ratio) && entry.ratio > 0)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 5)
      .map((entry) => entry.asset);

    // new_listings: The existing architecture only polls CoinGecko /coins/markets sorted by
    // market cap, which does not include a "listed at" date or a /coins/new endpoint.
    // Without reliable listing-date information, returning an empty array avoids fabricating
    // data. This can be populated when a listing-date source becomes available.
    const new_listings = [];

    res.set('Cache-Control', 'no-store');
    res.json({ trending, gainers, volume_spikes, new_listings });
  });

  app.get('/api/feed/leaderboard', (req, res) => {
    const snapshot = feed.getSnapshot();
    if (!snapshot) {
      res.set('Retry-After', '5');
      res.status(503).json({ error: 'Market data is not available yet. Try again shortly.' });
      return;
    }

    // assets are already sorted by momentum_score descending in buildSnapshot
    const leaderboard = snapshot.assets
      .slice(0, 10)
      .map((asset, index) => ({ rank: index + 1, ...asset }));

    res.set('Cache-Control', 'no-store');
    res.json({ leaderboard });
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
