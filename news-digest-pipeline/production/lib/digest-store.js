/**
 * Digest persistence for media CLIs. Callers import this module instead of src/db.
 */

import { join } from 'path';
import { getDb, initDb, updateDigest } from '../../src/db/index.js';
import { digestVideoUpdateFields } from '../../src/db/digest-video-fields.js';
import { ROOT } from './logging.js';

export { digestVideoUpdateFields, updateDigest };

export function resolvePipelineDbPath(env = process.env) {
  return env.DB_PATH || join(ROOT, 'data', 'news-digest.db');
}

export function resolvePublicBaseUrl(env = process.env) {
  const base = String(env.BASE_URL || env.SERVER_URL || '').trim();
  if (base) return base.replace(/\/+$/, '');
  return `http://localhost:${env.PORT || 3000}`;
}

export function initDigestStore(dbPath = resolvePipelineDbPath()) {
  return initDb(dbPath);
}

export function findLatestDigestId() {
  const row = getDb().prepare('SELECT id FROM digests ORDER BY date DESC LIMIT 1').get();
  return row?.id || null;
}

export function persistDigestFields(digestId, fields) {
  if (!digestId) return;
  updateDigest(digestId, fields);
}
