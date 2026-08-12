import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDigestContent,
  parseDigestArticles,
  parseDigestItemTexts,
  parseDigestItems,
  resolveApiKey,
  stripDigestFooter,
} from '../digest.js';
import {
  EXPECTED_HASH_PREFIX_ARTICLES,
  EXPECTED_INLINE_URL_ARTICLES,
  EXPECTED_SAMPLE_ARTICLES,
  EXPECTED_SHORT_ITEM_ARTICLES,
  SAMPLE_DIGEST,
  SAMPLE_DIGEST_HASH_PREFIX,
  SAMPLE_DIGEST_INLINE_URL,
  SAMPLE_DIGEST_SARCASTIC,
  SAMPLE_DIGEST_SHORT_ITEMS,
} from './fixtures/digest.js';
import { sqliteExecMock, unstubGlobals, withEnv } from './helpers.js';

afterEach(() => {
  unstubGlobals();
});

describe('stripDigestFooter', () => {
  it('removes the 🤖 disclaimer and trailing hashtags', () => {
    const cleaned = stripDigestFooter(SAMPLE_DIGEST);
    expect(cleaned).not.toMatch(/🤖/);
    expect(cleaned).not.toMatch(/#AI #News/);
    expect(cleaned).toContain('OpenAI оновив ChatGPT');
    expect(cleaned).toContain('ByteDance');
  });
});

describe('parseDigestArticles', () => {
  it('parses numbered items with URLs on the next line and drops the footer', () => {
    expect(parseDigestArticles(SAMPLE_DIGEST)).toEqual(EXPECTED_SAMPLE_ARTICLES);
  });

  it('parses #news / #AI prefixed numbering', () => {
    expect(parseDigestArticles(SAMPLE_DIGEST_HASH_PREFIX)).toEqual(EXPECTED_HASH_PREFIX_ARTICLES);
  });

  it('extracts inline URLs from article text', () => {
    expect(parseDigestArticles(SAMPLE_DIGEST_INLINE_URL)).toEqual(EXPECTED_INLINE_URL_ARTICLES);
  });

  it('drops items shorter than 40 characters', () => {
    expect(parseDigestArticles(SAMPLE_DIGEST_SHORT_ITEMS)).toEqual(EXPECTED_SHORT_ITEM_ARTICLES);
  });

  it('keeps sarcastic lead-ins (tone stripping is not the parser\'s job)', () => {
    const articles = parseDigestArticles(SAMPLE_DIGEST_SARCASTIC);
    expect(articles).toHaveLength(2);
    expect(articles[0].text).toMatch(/^Ну що, знову/u);
    expect(articles[0].url).toBe('https://openai.com/blog/gpt-5-6-sol');
    expect(articles[1].text).toMatch(/^Оце так історія/u);
  });

  it('returns an empty list for blank input', () => {
    expect(parseDigestArticles('')).toEqual([]);
    expect(parseDigestArticles(null)).toEqual([]);
  });
});

describe('parseDigestItems aliases', () => {
  it('parseDigestItems matches parseDigestArticles', () => {
    expect(parseDigestItems(SAMPLE_DIGEST)).toEqual(parseDigestArticles(SAMPLE_DIGEST));
  });

  it('parseDigestItemTexts returns only the text bodies', () => {
    expect(parseDigestItemTexts(SAMPLE_DIGEST)).toEqual(
      EXPECTED_SAMPLE_ARTICLES.map((a) => a.text),
    );
  });
});

describe('resolveApiKey', () => {
  it('prefers API_SECRET_KEY, then API_KEY, then API_ACCESS_KEY', () => {
    expect(resolveApiKey({
      API_SECRET_KEY: 'secret',
      API_KEY: 'key',
      API_ACCESS_KEY: 'access',
    })).toBe('secret');
    expect(resolveApiKey({ API_KEY: 'key', API_ACCESS_KEY: 'access' })).toBe('key');
    expect(resolveApiKey({ API_ACCESS_KEY: 'access' })).toBe('access');
    expect(resolveApiKey({})).toBe('');
  });
});

describe('getDigestContent', () => {
  const root = '/tmp/pipeline-root';
  const dbPath = `${root}/data/news-digest.db`;

  it('reads a digest directly from a file path', async () => {
    const readFileSync = vi.fn(() => SAMPLE_DIGEST);
    const existsSync = vi.fn((path) => path === '/tmp/digest.txt');

    const text = await getDigestContent('/tmp/digest.txt', {
      root,
      dbPath,
      existsSync,
      readFileSync,
      execFileSync: sqliteExecMock({}),
      fetchFn: vi.fn(),
      readdirSync: vi.fn(),
    });

    expect(text).toBe(SAMPLE_DIGEST);
    expect(readFileSync).toHaveBeenCalledWith('/tmp/digest.txt', 'utf-8');
  });

  it('loads the newest digest from sqlite for latest', async () => {
    const execFileSync = sqliteExecMock({ 'ORDER BY date DESC': SAMPLE_DIGEST });
    const text = await getDigestContent('latest', {
      root,
      dbPath,
      existsSync: vi.fn(() => true),
      execFileSync,
      fetchFn: vi.fn(),
      readFileSync: vi.fn(),
      readdirSync: vi.fn(),
    });

    expect(text).toBe(SAMPLE_DIGEST);
    expect(execFileSync).toHaveBeenCalled();
    expect(execFileSync.mock.calls[0][1][1]).toMatch(/ORDER BY date DESC/);
  });

  it('loads a specific digest id from sqlite', async () => {
    const execFileSync = sqliteExecMock({ "WHERE id='abc-1'": SAMPLE_DIGEST });
    const text = await getDigestContent('abc-1', {
      root,
      dbPath,
      existsSync: vi.fn((path) => path === dbPath),
      execFileSync,
      fetchFn: vi.fn(),
      readFileSync: vi.fn(),
      readdirSync: vi.fn(),
    });

    expect(text).toBe(SAMPLE_DIGEST);
    expect(execFileSync.mock.calls[0][1][1]).toContain("WHERE id='abc-1'");
  });

  it('falls back to the API with a unified API key header', async () => {
    const fetchFn = vi.fn(async (url, options) => {
      expect(url).toBe('http://localhost:3000/api/digests/latest/text');
      expect(options.headers['X-API-Key']).toBe('secret');
      return { ok: true, status: 200, text: async () => SAMPLE_DIGEST };
    });

    const text = await withEnv({ API_SECRET_KEY: 'secret', API_KEY: undefined, API_ACCESS_KEY: undefined }, () => (
      getDigestContent('latest', {
        root,
        dbPath,
        server: 'http://localhost:3000',
        apiKey: resolveApiKey(),
        existsSync: vi.fn(() => false),
        execFileSync: sqliteExecMock({}),
        fetchFn,
        readFileSync: vi.fn(),
        readdirSync: vi.fn(),
      })
    ));

    expect(text).toBe(SAMPLE_DIGEST);
  });

  it('falls back to the newest local digest_*.txt when DB and API fail', async () => {
    const readFileSync = vi.fn(() => SAMPLE_DIGEST);
    const readdirSync = vi.fn(() => [
      'digest_2026-08-01.txt',
      'digest_2026-08-11.txt',
      'notes.txt',
    ]);

    const text = await getDigestContent('latest', {
      root,
      dbPath,
      existsSync: vi.fn((path) => path === `${root}/output`),
      execFileSync: sqliteExecMock({}),
      fetchFn: vi.fn(async () => ({ ok: false, status: 503, text: async () => '' })),
      readdirSync,
      readFileSync,
    });

    expect(text).toBe(SAMPLE_DIGEST);
    expect(readFileSync).toHaveBeenCalledWith(`${root}/output/digest_2026-08-11.txt`, 'utf-8');
  });

  it('throws when no source has digest content', async () => {
    await expect(getDigestContent('latest', {
      root,
      dbPath,
      existsSync: vi.fn(() => false),
      execFileSync: sqliteExecMock({}),
      fetchFn: vi.fn(async () => { throw new Error('offline'); }),
      readdirSync: vi.fn(() => []),
      readFileSync: vi.fn(),
    })).rejects.toThrow(/Could not get digest content/);
  });
});
