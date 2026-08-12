/**
 * Shared digest loading + parsing for image, reel, and audio pipelines.
 *
 * Callers may inject fs/exec/fetch in tests. Production scripts can keep using
 * the defaults until they are migrated to this module.
 */

import { existsSync as fsExistsSync, readFileSync as fsReadFileSync, readdirSync as fsReaddirSync } from 'fs';
import { execFileSync as fsExecFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PIPELINE_ROOT = join(__dirname, '..', '..');

const MIN_ARTICLE_CHARS = 40;

export function resolveApiKey(env = process.env) {
  return env.API_SECRET_KEY || env.API_KEY || env.API_ACCESS_KEY || '';
}

export function stripDigestFooter(digestText) {
  return String(digestText || '')
    .replace(/\n🤖[\s\S]*$/g, '')
    .replace(/\nХештеги:[\s\S]*$/gi, '')
    .replace(/\n#[\wА-Яа-яІіЇїЄєҐґ]+(?:\s+#[\wА-Яа-яІіЇїЄєҐґ]+)*\s*$/g, '');
}

function extractInlineUrl(text) {
  const source = String(text || '');
  const urlMatch = source.match(/(https?:\/\/\S+)/);
  if (!urlMatch) return { text: source.replace(/\s+/g, ' ').trim(), url: '' };
  return {
    text: source.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim(),
    url: urlMatch[1],
  };
}

/**
 * Parse numbered digest blocks into { text, url }[].
 * Handles "#news 1." / "#AI 2." prefixes, URLs on their own line, inline URLs,
 * 🤖 / hashtag footers, and drops items shorter than 40 characters.
 */
export function parseDigestArticles(digestText) {
  const articles = [];
  const lines = stripDigestFooter(digestText).split('\n');
  let current = { text: '', url: '' };

  const pushCurrent = () => {
    if (current.text || current.url) articles.push(current);
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const numberMatch = line.match(/^(?:#\S+\s+)?(\d+)\.\s*(.*)/);
    if (numberMatch) {
      pushCurrent();
      current = { text: numberMatch[2], url: '' };
    } else if (/^https?:\/\//i.test(line)) {
      current.url = line;
    } else {
      current.text += (current.text ? ' ' : '') + line;
    }
  }
  pushCurrent();

  return articles
    .map((article) => {
      if (article.url) {
        return {
          text: String(article.text || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim(),
          url: article.url,
        };
      }
      return extractInlineUrl(article.text);
    })
    .filter((article) => article.text && article.text.length > MIN_ARTICLE_CHARS);
}

/** Alias used by the storyboard / reel fallback parser. */
export function parseDigestItems(digestText) {
  return parseDigestArticles(digestText);
}

export function parseDigestItemTexts(digestText) {
  return parseDigestArticles(digestText).map((article) => article.text);
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function loadLatestDigestFromDb({ dbPath, existsSync, execFileSync, log }) {
  if (!existsSync(dbPath)) return null;
  try {
    return (execFileSync('sqlite3', [
      dbPath,
      'SELECT content FROM digests ORDER BY date DESC LIMIT 1;',
    ], { encoding: 'utf8' }).trim() || null);
  } catch (err) {
    log(`Warning: could not query DB: ${err.message}`);
    return null;
  }
}

function loadDigestByIdFromDb(digestId, { dbPath, existsSync, execFileSync, log }) {
  if (!existsSync(dbPath)) return null;
  try {
    return (execFileSync('sqlite3', [
      dbPath,
      `SELECT content FROM digests WHERE id='${escapeSqlLiteral(digestId)}';`,
    ], { encoding: 'utf8' }).trim() || null);
  } catch (err) {
    log(`Warning: DB lookup by id failed: ${err.message}`);
    return null;
  }
}

function loadDigestFromLocalFiles({ root, existsSync, readdirSync, readFileSync, log }) {
  const outputDir = join(root, 'output');
  if (!existsSync(outputDir)) return null;
  const files = readdirSync(outputDir).filter((f) => f.startsWith('digest_') && f.endsWith('.txt'));
  if (files.length === 0) return null;
  files.sort().reverse();
  log(`Found local digest file: ${files[0]}`);
  return readFileSync(join(outputDir, files[0]), 'utf-8');
}

/**
 * Load digest text: file path → DB → API → local output/*.txt.
 */
export async function getDigestContent(digestId = 'latest', options = {}) {
  const {
    root = PIPELINE_ROOT,
    dbPath = join(root, 'data', 'news-digest.db'),
    server = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`,
    apiKey = resolveApiKey(),
    fetchFn = globalThis.fetch.bind(globalThis),
    execFileSync = fsExecFileSync,
    existsSync = fsExistsSync,
    readFileSync = fsReadFileSync,
    readdirSync = fsReaddirSync,
    log = () => {},
  } = options;

  const deps = { root, dbPath, existsSync, execFileSync, readdirSync, readFileSync, log };

  if (digestId !== 'latest' && existsSync(digestId)) {
    log(`Reading digest directly from file: ${digestId}`);
    return readFileSync(digestId, 'utf-8');
  }

  if (digestId === 'latest') {
    const dbContent = loadLatestDigestFromDb(deps);
    if (dbContent) {
      log('Loaded newest digest from pipeline DB (date-ordered).');
      return dbContent;
    }
  } else {
    const row = loadDigestByIdFromDb(digestId, deps);
    if (row) {
      log(`Loaded digest ${digestId} from pipeline DB.`);
      return row;
    }
  }

  try {
    const url = digestId === 'latest'
      ? `${server}/api/digests/latest/text`
      : `${server}/api/digests/${digestId}/text`;
    const headers = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    log(`Fetching from API: ${url}`);
    const res = await fetchFn(url, { headers });
    if (res.ok) return await res.text();
    log(`API fetch failed with status: ${res.status}`);
  } catch (err) {
    log(`API connection failed: ${err.message}`);
  }

  const localContent = loadDigestFromLocalFiles(deps);
  if (localContent) return localContent;

  throw new Error('Could not get digest content from DB, API, or local files.');
}
