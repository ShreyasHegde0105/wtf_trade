import { transform } from 'esbuild';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function load(url, context, defaultLoad) {
  if (url.endsWith('.jsx')) {
    const raw = await fs.readFile(fileURLToPath(url), 'utf-8');
    const result = await transform(raw, { loader: 'jsx', format: 'esm', jsx: 'automatic' });
    return {
      format: 'module',
      shortCircuit: true,
      source: result.code,
    };
  }
  return defaultLoad(url, context);
}
