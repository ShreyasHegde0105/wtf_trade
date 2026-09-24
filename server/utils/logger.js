// One JSON object per line. Callers must never pass secrets or request headers.
function write(level, msg, meta) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  const stream = level === 'info' ? process.stdout : process.stderr;
  stream.write(`${line}\n`);
}

export const logger = {
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};
