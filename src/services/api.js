// The frontend's only network layer. VITE_API_BASE_URL is empty locally (Vite proxies
// /api to the backend) and is the backend origin when deployed (e.g. Railway).
import { sanitizeAsset } from '../utils/assets.js';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const SNAPSHOT_TIMEOUT_MS = 10_000;

export const streamUrl = () => `${API_BASE}/api/feed/stream`;

export async function fetchSnapshot(signal) {
  const response = await fetch(`${API_BASE}/api/feed/snapshot`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS)]),
  });
  if (!response.ok) throw new Error(`Snapshot request failed (${response.status})`);

  const body = await response.json();
  if (!Array.isArray(body?.assets)) throw new Error('Snapshot response was malformed');
  return body.assets.map(sanitizeAsset).filter(Boolean);
}
