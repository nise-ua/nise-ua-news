import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

export function initDb(dbPath) {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  // Idempotent migrations for existing DBs
  const articleCols = new Set(db.prepare('PRAGMA table_info(articles)').all().map((c) => c.name));
  if (!articleCols.has('source_chat_id')) {
    db.exec('ALTER TABLE articles ADD COLUMN source_chat_id TEXT');
  }
  if (!articleCols.has('source_message_id')) {
    db.exec('ALTER TABLE articles ADD COLUMN source_message_id TEXT');
  }

  // Token accounting + cost columns on digests (idempotent)
  const digestCols = new Set(db.prepare('PRAGMA table_info(digests)').all().map((c) => c.name));
  if (!digestCols.has('seq_number')) {
    // createDigest writes seq_number, so older DBs missing this column break
    // digest creation entirely. Add it and backfill existing rows in order.
    db.exec('ALTER TABLE digests ADD COLUMN seq_number INTEGER');
    const rows = db.prepare('SELECT id FROM digests ORDER BY created_at ASC, rowid ASC').all();
    const setSeq = db.prepare('UPDATE digests SET seq_number = ? WHERE id = ?');
    rows.forEach((r, i) => setSeq.run(i + 1, r.id));
  }
  if (!digestCols.has('model')) {
    db.exec('ALTER TABLE digests ADD COLUMN model TEXT');
  }
  if (!digestCols.has('input_tokens')) {
    db.exec('ALTER TABLE digests ADD COLUMN input_tokens INTEGER DEFAULT 0');
  }
  if (!digestCols.has('output_tokens')) {
    db.exec('ALTER TABLE digests ADD COLUMN output_tokens INTEGER DEFAULT 0');
  }
  // Ensure cost and video URL columns exist. Older DBs may have cost_usd but lack video_url.
  if (!digestCols.has('cost_usd')) {
    db.exec('ALTER TABLE digests ADD COLUMN cost_usd REAL');
  }
  if (!digestCols.has('reel_url')) {
    db.exec('ALTER TABLE digests ADD COLUMN reel_url TEXT');
  }
  if (!digestCols.has('facebook_reel_id')) {
    db.exec('ALTER TABLE digests ADD COLUMN facebook_reel_id TEXT');
  }
  if (!digestCols.has('facebook_story_id')) {
    db.exec('ALTER TABLE digests ADD COLUMN facebook_story_id TEXT');
  }

  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export function insertArticle({ url, title, content, source = 'extension', sourceChatId = null, sourceMessageId = null }) {
  const existing = db.prepare('SELECT id, url, title, status FROM articles WHERE url = ?').get(url);
  if (existing) {
    return { ...existing, duplicate: true };
  }

  const id = uuidv4();
  db.prepare(
    `INSERT INTO articles (id, url, title, content, source, source_chat_id, source_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, url, title || null, content || null, source, sourceChatId, sourceMessageId);

  return { id, url, title, status: 'new', duplicate: false };
}

export function getNewArticles(limit = 50) {
  return db.prepare(
    'SELECT * FROM articles WHERE status = ? AND digest_id IS NULL ORDER BY created_at ASC LIMIT ?'
  ).all('new', limit);
}

export function getArticleCount(status) {
  if (status) {
    return db.prepare('SELECT COUNT(*) as count FROM articles WHERE status = ?').get(status).count;
  }
  return db.prepare('SELECT COUNT(*) as count FROM articles').get().count;
}

export function updateArticleStatus(id, status) {
  db.prepare(
    `UPDATE articles SET status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(status, id);
}

export function updateArticleCommentary(id, commentary) {
  db.prepare(
    `UPDATE articles SET commentary = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(commentary, id);
}

export function assignArticlesToDigest(articleIds, digestId) {
  const stmt = db.prepare(
    `UPDATE articles SET digest_id = ?, status = 'used', updated_at = datetime('now') WHERE id = ?`
  );
  const transaction = db.transaction((ids) => {
    for (const id of ids) {
      stmt.run(digestId, id);
    }
  });
  transaction(articleIds);
}

export function createDigest({ date, part = 1, articlesCount = 0 }) {
  const id = uuidv4();
  // Auto-increment seq_number
  const maxSeq = db.prepare('SELECT COALESCE(MAX(seq_number), 0) as max FROM digests').get().max;
  db.prepare(
    `INSERT INTO digests (id, date, part, articles_count, seq_number) VALUES (?, ?, ?, ?, ?)`
  ).run(id, date, part, articlesCount, maxSeq + 1);
  return id;
}

export function updateDigest(id, fields) {
  const allowed = ['content', 'status', 'generation_log', 'published_at',
    'facebook_post_id', 'facebook_reel_id', 'facebook_story_id',
    'telegram_message_id', 'youtube_post_id', 'articles_count',
    'model', 'input_tokens', 'output_tokens', 'cost_usd', 'video_url', 'reel_url'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return;

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE digests SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function getDigest(id) {
  return db.prepare('SELECT * FROM digests WHERE id = ?').get(id);
}

export function getDigests(filters = {}) {
  let query = 'SELECT * FROM digests';
  const params = [];

  if (filters.status) {
    query += ' WHERE status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY created_at DESC';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  return db.prepare(query).all(...params);
}

export function getArticlesByDigestId(digestId) {
  return db.prepare(
    'SELECT * FROM articles WHERE digest_id = ? ORDER BY created_at ASC'
  ).all(digestId);
}

export function deleteArticle(id) {
  return db.prepare('DELETE FROM articles WHERE id = ?').run(id);
}

export function resetErrorArticles() {
  const result = db.prepare(
    `UPDATE articles SET status = 'new', fetch_error = NULL, updated_at = datetime('now') WHERE status = 'error'`
  ).run();
  return { updated: result.changes };
}

/**
 * Return an article from an error or completed digest back to the new queue.
 * Used articles must be unlinked from their digest so they can be selected
 * for generation again.
 */
export function resetArticleToNew(id) {
  const result = db.prepare(
    `UPDATE articles
     SET status = 'new', digest_id = NULL, commentary = NULL,
         fetch_error = NULL, updated_at = datetime('now')
     WHERE id = ? AND status IN ('error', 'used')`
  ).run(id);
  return { updated: result.changes };
}

/**
 * Reset articles stuck in 'processing' status back to 'new' so they can be
 * picked up again by the next digest generation cycle.
 *
 * These articles get stuck when:
 *   - The server is restarted/killed mid-generation
 *   - Phase B (assembly) of digest generation fails after Phase A completed
 *   - An LLM call hangs indefinitely (no timeout)
 *
 * @param {number} [staleAgeMinutes=30] - Only reset articles stuck longer than
 *   this many minutes. Pass 0 or omit to reset all processing articles.
 * @returns {{updated: number}}
 */
export function resetStuckProcessingArticles(staleAgeMinutes = 30) {
  let query;
  if (staleAgeMinutes > 0) {
    // Only reset articles that have been in 'processing' for longer than the
    // stale threshold. This avoids resetting articles that are actively being
    // generated by a concurrent run.
    query = `UPDATE articles SET status = 'new', fetch_error = 'Stuck in processing — reset by recovery sweep', updated_at = datetime('now') WHERE status = 'processing' AND updated_at < datetime('now', ?)`;
    const result = db.prepare(query).run(`-${staleAgeMinutes} minutes`);
    return { updated: result.changes };
  } else {
    // Reset ALL processing articles (used on startup when no concurrent runs
    // are possible).
    query = `UPDATE articles SET status = 'new', fetch_error = 'Stuck in processing — reset on server startup', updated_at = datetime('now') WHERE status = 'processing'`;
    const result = db.prepare(query).run();
    return { updated: result.changes };
  }
}