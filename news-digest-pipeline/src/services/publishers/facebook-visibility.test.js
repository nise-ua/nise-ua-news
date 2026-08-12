import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkFacebookPostVisibility, verifyPublishedFacebookPost } from './facebook-visibility.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('checkFacebookPostVisibility', () => {
  it('requires token and post id', async () => {
    const result = await checkFacebookPostVisibility('', '111', '');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Missing/);
  });

  it('normalizes bare post ids with page id', async () => {
    global.fetch = vi.fn(async (url) => {
      expect(String(url)).toContain('/111_222?');
      return {
        ok: true,
        json: async () => ({
          id: '111_222',
          is_published: true,
          is_hidden: false,
          privacy: { value: 'EVERYONE' },
          permalink_url: 'https://www.facebook.com/111/posts/222',
        }),
      };
    });

    const result = await checkFacebookPostVisibility('token', '111', '222');
    expect(result.ok).toBe(true);
    expect(result.privacyPublic).toBe(true);
    expect(result.permalinkUrl).toContain('/posts/222');
  });

  it('flags hidden and non-public posts', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: '111_222',
        is_published: true,
        is_hidden: true,
        privacy: { value: 'FRIENDS' },
      }),
    }));

    const result = await checkFacebookPostVisibility('token', '111', '111_222');
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/hidden/i);
    expect(result.reasons.join(' ')).toMatch(/restricted/i);
  });

  it('surfaces Graph API errors', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: { message: 'Unsupported get request' } }),
    }));

    const result = await checkFacebookPostVisibility('token', '111', '111_222');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Unsupported get request/);
  });
});

describe('verifyPublishedFacebookPost', () => {
  it('logs a warning without throwing when the post looks restricted', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: '111_222',
        is_published: false,
        is_hidden: false,
        privacy: { value: 'EVERYONE' },
      }),
    }));

    const log = { log: vi.fn(), warn: vi.fn() };
    const result = await verifyPublishedFacebookPost('token', '111', '111_222', log);
    expect(result.ok).toBe(false);
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn.mock.calls[0][0]).toMatch(/invisible to other users/);
  });
});
