import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';

const MAX_ITEMS = 500;
const MAX_SIGNAL_LENGTH = 32;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const digest = (value) => createHash('sha256').update(value).digest();

/** Constant-time compare. Hashing first gives equal-length buffers, so timingSafeEqual cannot throw. */
export function secretMatches(provided, expected) {
  if (typeof provided !== 'string' || provided === '' || !expected) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

function parseItem(raw, label, now) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: [`${label} must be an object`] };

  const errors = [];
  const symbol = typeof raw.symbol === 'string' ? raw.symbol.trim().toUpperCase() : '';
  if (!SYMBOL_PATTERN.test(symbol)) errors.push(`${label}.symbol must be a ticker such as "BTC"`);

  if (typeof raw.score !== 'number' || !Number.isFinite(raw.score)) {
    errors.push(`${label}.score must be a finite number`);
  }

  const signal = typeof raw.signal === 'string' ? raw.signal.trim() : '';
  if (signal === '' || signal.length > MAX_SIGNAL_LENGTH) {
    errors.push(`${label}.signal must be a non-empty string of at most ${MAX_SIGNAL_LENGTH} characters`);
  }

  const ts = typeof raw.updated_at === 'string' && ISO_PATTERN.test(raw.updated_at) ? Date.parse(raw.updated_at) : NaN;
  if (Number.isNaN(ts)) errors.push(`${label}.updated_at must be an ISO 8601 timestamp`);
  else if (ts > now + MAX_FUTURE_SKEW_MS) errors.push(`${label}.updated_at is in the future`);

  if (errors.length > 0) return { errors };
  return { item: { symbol, score: raw.score, signal, updated_at: new Date(ts).toISOString() } };
}

/** Accepts one score object or an array of them. Returns { items } or { errors }. */
export function parseScorePayload(body, now = Date.now()) {
  const isBatch = Array.isArray(body);
  const list = isBatch ? body : [body];
  if (list.length === 0) return { errors: ['body must contain at least one score'] };
  if (list.length > MAX_ITEMS) return { errors: [`at most ${MAX_ITEMS} scores per request`] };

  const items = [];
  const errors = [];
  list.forEach((raw, index) => {
    const result = parseItem(raw, isBatch ? `[${index}]` : 'body', now);
    if (result.errors) errors.push(...result.errors);
    else items.push(result.item);
  });
  return errors.length > 0 ? { errors: errors.slice(0, 20) } : { items };
}

const preview = (body) => {
  try {
    return JSON.stringify(body).slice(0, 2000);
  } catch {
    return '[unserializable]';
  }
};

/**
 * POST /internal/scores: the scoring engine pushes momentum scores here each cycle.
 * Auth is a shared secret in X-WTF-Secret, checked before the body is parsed.
 */
export function createInternalScoresRouter({ secret, scoreStore, logger }) {
  const router = express.Router();

  router.post(
    '/internal/scores',
    (req, res, next) => {
      if (!secret || !scoreStore) {
        logger.error('scores_webhook_not_configured', { hasSecret: Boolean(secret), hasDatabase: Boolean(scoreStore) });
        res.status(503).json({ error: 'Score webhook is not configured' });
        return;
      }
      const provided = req.get('x-wtf-secret');
      if (!secretMatches(provided, secret)) {
        logger.warn('scores_auth_failed', { ip: req.ip, reason: provided ? 'mismatch' : 'missing' });
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      if (!req.is('application/json')) {
        res.status(415).json({ error: 'Content-Type must be application/json' });
        return;
      }
      next();
    },
    express.json({ limit: '256kb' }),
    async (req, res) => {
      const parsed = parseScorePayload(req.body);
      if (parsed.errors) {
        logger.warn('scores_rejected', { errors: parsed.errors, body: preview(req.body) });
        res.status(400).json({ error: 'bad payload', details: parsed.errors });
        return;
      }

      logger.info('scores_received', { count: parsed.items.length, scores: parsed.items });
      try {
        const result = await scoreStore.saveScores(parsed.items);
        if (result.rejected.length > 0) {
          logger.warn('scores_unknown_symbols', { symbols: result.rejected.map((r) => r.symbol) });
        }
        res.json({ ok: true, ...result });
      } catch (error) {
        logger.error('scores_store_failed', { reason: error.message, status: error.status, code: error.code });
        res.status(502).json({ error: 'Storage unavailable, retry later' });
      }
    },
  );

  // Body-parser failures on this route answer in JSON instead of the generic 500.
  // eslint-disable-next-line no-unused-vars
  router.use('/internal', (error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      logger.warn('scores_rejected', { errors: ['invalid JSON'] });
      res.status(400).json({ error: 'bad payload', details: ['body is not valid JSON'] });
      return;
    }
    if (error.type === 'entity.too.large') {
      res.status(413).json({ error: 'Payload too large' });
      return;
    }
    next(error);
  });

  router.use('/internal', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return router;
}
