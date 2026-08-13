import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./facebook-page-browser.js', () => ({
  publishToFacebookPageViaBrowser: vi.fn(),
}));
vi.mock('./facebook-page-match.js', () => ({
  resolveLatestBrowserPost: vi.fn(),
}));
vi.mock('./facebook-visibility.js', () => ({
  verifyPublishedFacebookPost: vi.fn(),
}));

import { publishToFacebookPageViaBrowser } from './facebook-page-browser.js';
import { resolveLatestBrowserPost } from './facebook-page-match.js';
import { verifyPublishedFacebookPost } from './facebook-visibility.js';
import { publishToFacebook } from './facebook.js';

describe('publishToFacebook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishToFacebookPageViaBrowser.mockResolvedValue({ ok: true, via: 'browser' });
    resolveLatestBrowserPost.mockResolvedValue({
      postId: '111_222',
      permalinkUrl: 'https://www.facebook.com/111/posts/222',
      application: null,
      raw: { from: { id: '111' } },
    });
    verifyPublishedFacebookPost.mockResolvedValue({ ok: true, postId: '111_222' });
  });

  it('publishes via the Page composer instead of Graph /feed', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const result = await publishToFacebook('token', '111', 'Дайджест текст тут', {
      pageName: 'Nise-ua',
      profileDir: '/tmp/fb-page-profile',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(publishToFacebookPageViaBrowser).toHaveBeenCalledWith({
      pageId: '111',
      pageName: 'Nise-ua',
      content: 'Дайджест текст тут',
      profileDir: '/tmp/fb-page-profile',
      timezoneId: undefined,
    });
    expect(resolveLatestBrowserPost).toHaveBeenCalledWith('token', '111', 'Дайджест текст тут');
    expect(result).toEqual({
      postId: '111_222',
      permalinkUrl: 'https://www.facebook.com/111/posts/222',
      via: 'browser',
      visibility: { ok: true, postId: '111_222' },
    });
  });

  it('fails if the resolved post is still tagged as the Meta app', async () => {
    resolveLatestBrowserPost.mockResolvedValue({
      postId: '111_222',
      application: { name: 'news' },
      raw: { admin_creator: { name: 'news' } },
    });

    const result = await publishToFacebook('token', '111', 'Дайджест текст тут');
    expect(result.error).toMatch(/still tagged as app "news"/);
    expect(verifyPublishedFacebookPost).not.toHaveBeenCalled();
  });

  it('returns the browser error without hitting Graph resolve', async () => {
    publishToFacebookPageViaBrowser.mockResolvedValue({
      error: '[facebook-page-browser] Not logged in',
    });

    const result = await publishToFacebook('token', '111', 'Дайджест текст тут');
    expect(result.error).toMatch(/Not logged in/);
    expect(resolveLatestBrowserPost).not.toHaveBeenCalled();
  });
});
