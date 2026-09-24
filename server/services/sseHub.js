const MAX_BUFFERED_BYTES = 1_000_000;

/** Tracks SSE clients and fans one shared update out to all of them. */
export function createSseHub({ heartbeatMs, maxClients, logger }) {
  const clients = new Set();
  let heartbeat = null;

  const encode = (assets) => assets.map((asset) => `data: ${JSON.stringify(asset)}\n\n`).join('');

  function remove(res, reason) {
    if (!clients.delete(res)) return;
    if (clients.size === 0) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    logger.info('sse_client_disconnected', { clients: clients.size, reason });
  }

  function writeToAll(chunk) {
    for (const res of clients) {
      if (res.writableLength > MAX_BUFFERED_BYTES) {
        res.destroy(); // client is not reading; drop it instead of buffering forever
        remove(res, 'slow_client');
        continue;
      }
      try {
        res.write(chunk);
      } catch {
        remove(res, 'write_failed');
      }
    }
  }

  return {
    get size() {
      return clients.size;
    },

    connect(req, res, initialAssets) {
      if (clients.size >= maxClients) {
        res.status(503).json({ error: 'Too many live connections. Try again shortly.' });
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // stop nginx-style proxies from buffering the stream
      });
      res.write('retry: 5000\n\n');
      if (initialAssets?.length) res.write(encode(initialAssets));

      clients.add(res);
      if (!heartbeat) {
        heartbeat = setInterval(() => writeToAll(': ping\n\n'), heartbeatMs);
        heartbeat.unref();
      }
      res.on('close', () => remove(res, 'closed'));
      res.on('error', () => remove(res, 'error'));
      logger.info('sse_client_connected', { clients: clients.size });
    },

    /** One `data:` event per asset. */
    broadcast(assets) {
      if (clients.size > 0) writeToAll(encode(assets));
    },

    closeAll() {
      for (const res of clients) res.end();
      clients.clear();
      clearInterval(heartbeat);
      heartbeat = null;
    },
  };
}
