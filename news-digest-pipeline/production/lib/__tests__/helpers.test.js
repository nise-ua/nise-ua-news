import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mockExecFileSync,
  mockFetchResponses,
  sqliteExecMock,
  unstubGlobals,
  withEnv,
} from './helpers.js';
import {
  EXPECTED_SAMPLE_ARTICLES,
  SAMPLE_DIGEST,
  SAMPLE_DIGEST_SHORT_ITEMS,
} from './fixtures/digest.js';

afterEach(() => {
  unstubGlobals();
});

describe('withEnv', () => {
  it('sets env vars for the callback and restores them after', () => {
    delete process.env.API_KEY;
    process.env.API_ACCESS_KEY = 'old';

    withEnv({ API_KEY: 'new-key', API_ACCESS_KEY: undefined }, () => {
      expect(process.env.API_KEY).toBe('new-key');
      expect(process.env.API_ACCESS_KEY).toBeUndefined();
    });

    expect(process.env.API_KEY).toBeUndefined();
    expect(process.env.API_ACCESS_KEY).toBe('old');
    delete process.env.API_ACCESS_KEY;
  });
});

describe('mockFetchResponses', () => {
  it('returns configured status and body for a matching URL', async () => {
    const fetchMock = mockFetchResponses([
      { urlIncludes: '/api/digests/latest/text', status: 200, body: SAMPLE_DIGEST },
      { status: 404, body: 'missing' },
    ]);

    const ok = await fetch('http://localhost:3000/api/digests/latest/text');
    expect(ok.ok).toBe(true);
    expect(await ok.text()).toContain('OpenAI оновив ChatGPT');

    const miss = await fetch('http://localhost:3000/api/other');
    expect(miss.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('captures request headers for API key assertions', async () => {
    const fetchMock = mockFetchResponses([{ status: 200, body: 'ok' }]);
    await fetch('http://localhost:3000/api/digests/latest/text', {
      headers: { 'X-API-Key': 'secret' },
    });
    expect(fetchMock.mock.calls[0][1].headers['X-API-Key']).toBe('secret');
  });
});

describe('sqliteExecMock', () => {
  it('returns content when SQL contains the expected snippet', () => {
    const exec = sqliteExecMock({
      'ORDER BY date DESC': SAMPLE_DIGEST,
      "WHERE id='abc'": 'digest-by-id',
    });

    expect(exec('sqlite3', ['db.sqlite', 'SELECT content FROM digests ORDER BY date DESC LIMIT 1;']))
      .toBe(SAMPLE_DIGEST);
    expect(exec('sqlite3', ['db.sqlite', "SELECT content FROM digests WHERE id='abc';"]))
      .toBe('digest-by-id');
    expect(exec('sqlite3', ['db.sqlite', 'SELECT 1;'])).toBe('');
  });

  it('throws on unexpected commands', () => {
    const exec = sqliteExecMock({});
    expect(() => exec('ffmpeg', ['-i', 'a.mp4'])).toThrow(/unexpected command/);
  });
});

describe('mockExecFileSync', () => {
  it('delegates to impl and records calls', () => {
    const exec = mockExecFileSync({
      impl: (cmd, args) => (cmd === 'ffprobe' ? '4.20\n' : ''),
    });
    expect(exec('ffprobe', ['-v', 'error', 'audio.mp3'])).toBe('4.20\n');
    expect(exec.mock.calls[0][0]).toBe('ffprobe');
  });
});

describe('digest fixtures', () => {
  it('sample digest has three full articles and a footer to strip', () => {
    expect(EXPECTED_SAMPLE_ARTICLES).toHaveLength(3);
    expect(SAMPLE_DIGEST).toMatch(/🤖/);
    expect(SAMPLE_DIGEST).toMatch(/#AI #News/);
    for (const article of EXPECTED_SAMPLE_ARTICLES) {
      expect(article.text.length).toBeGreaterThan(40);
      expect(article.url).toMatch(/^https?:\/\//);
    }
  });

  it('short-item fixture contains one item below the 40-char cutoff', () => {
    expect(SAMPLE_DIGEST_SHORT_ITEMS).toMatch(/^1\. Коротко\./m);
    expect('Коротко.'.length).toBeLessThan(40);
  });
});
