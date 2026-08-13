import { describe, expect, it, vi } from 'vitest';
import {
  fingerprintMessage,
  isBrowserComposerPost,
  messagesMatch,
  pickLatestMatchingBrowserPost,
  resolveLatestBrowserPost,
} from './facebook-page-match.js';

const pageId = '1194848510384596';
const content = '1. Ось вам «розумні» авто, які розуміють ваші потреби краще, ніж ви самі.';

describe('facebook-page-match', () => {
  it('fingerprints whitespace-normalized text', () => {
    expect(fingerprintMessage('  Hello\n\nWorld  ', 20)).toBe('hello world');
  });

  it('rejects Graph app posts', () => {
    expect(isBrowserComposerPost({
      from: { id: pageId },
      application: { name: 'news', id: '1' },
    }, pageId)).toBe(false);
    expect(isBrowserComposerPost({
      from: { id: pageId },
      admin_creator: { name: 'news' },
    }, pageId)).toBe(false);
  });

  it('accepts composer posts from the Page', () => {
    expect(isBrowserComposerPost({
      from: { id: pageId },
      message: content,
    }, pageId)).toBe(true);
  });

  it('picks the newest matching composer post inside the age window', () => {
    const now = Date.parse('2026-08-12T02:30:00.000Z');
    const match = pickLatestMatchingBrowserPost([
      {
        id: 'old-app',
        created_time: '2026-08-12T02:28:00+0000',
        status_type: 'mobile_status_update',
        from: { id: pageId },
        application: { name: 'news' },
        message: content,
      },
      {
        id: 'manual',
        created_time: '2026-08-12T02:29:00+0000',
        status_type: 'mobile_status_update',
        from: { id: pageId },
        message: `${content}\n\nhttps://example.com`,
      },
      {
        id: 'reel',
        created_time: '2026-08-12T02:29:30+0000',
        status_type: 'added_video',
        from: { id: pageId },
        message: content,
      },
    ], { content, pageId, now });

    expect(match?.id).toBe('manual');
  });

  it('does not match unrelated text', () => {
    expect(messagesMatch('Hello world', content)).toBe(false);
  });
});

describe('resolveLatestBrowserPost', () => {
  it('returns the matching composer post after retries', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{
          id: `${pageId}_999`,
          created_time: new Date().toISOString(),
          status_type: 'mobile_status_update',
          from: { id: pageId },
          permalink_url: 'https://www.facebook.com/p/999',
          message: content,
        }],
      }),
    }));

    const result = await resolveLatestBrowserPost('token', pageId, content, {
      fetchImpl,
      sleepFn: async () => {},
      attempts: 2,
    });

    expect(result.postId).toBe(`${pageId}_999`);
    expect(result.permalinkUrl).toContain('/p/999');
    expect(result.application).toBeNull();
  });

  it('errors when Graph never returns a composer post', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{
          id: `${pageId}_111`,
          created_time: new Date().toISOString(),
          status_type: 'mobile_status_update',
          from: { id: pageId },
          application: { name: 'news' },
          message: content,
        }],
      }),
    }));

    const result = await resolveLatestBrowserPost('token', pageId, content, {
      fetchImpl,
      sleepFn: async () => {},
      attempts: 2,
    });

    expect(result.error).toMatch(/Could not find a browser composer post/);
  });
});
