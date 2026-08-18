import { describe, expect, it, vi } from 'vitest';
import { normalizeAnalytics, publishPostizDigest, waitForPostizReleaseUrl, firstFacebookRelease } from './postiz.js';

const config = {
  publishBackend: 'postiz',
  postizChannelIds: ['fb-1', 'ig-2'],
  facebookPageId: 'page',
  postizApiUrl: 'http://postiz',
  postizApiKey: 'key',
};

describe('Postiz publisher', () => {
  it('creates one provider payload per selected channel', async () => {
    const client = {
      integrations: vi.fn().mockResolvedValue([
        { id: 'fb-1', platform: 'facebook' },
        { id: 'ig-2', platform: 'instagram' },
        { id: 'not-selected', platform: 'facebook' },
      ]),
      createPost: vi.fn().mockResolvedValue({
        posts: [
          { id: 'post-1', releaseURL: 'https://fb/post-1' },
          { id: 'post-2', releaseURL: 'https://ig/post-2' },
        ],
      }),
    };
    const result = await publishPostizDigest({ id: 'd1', content: 'Текст' }, config, 'text', { client });
    expect(client.createPost).toHaveBeenCalledWith([
      expect.objectContaining({ integration: { id: 'fb-1' }, settings: { __type: 'facebook', post_type: 'post' } }),
      expect.objectContaining({ integration: { id: 'ig-2' }, settings: { __type: 'instagram', post_type: 'post' } }),
    ]);
    expect(result.posts.map((p) => p.postId)).toEqual(['post-1', 'post-2']);
    expect(result.posts[0].releaseURL).toBe('https://fb/post-1');
  });

  it('polls Postiz until a Facebook release URL is available', async () => {
    const client = {
      integrations: vi.fn().mockResolvedValue([{ id: 'fb-1', identifier: 'Facebook' }]),
      createPost: vi.fn().mockResolvedValue({ posts: [{ id: 'cms-post', releaseURL: 'missing' }] }),
      listPosts: vi.fn()
        .mockResolvedValueOnce({ posts: [{ id: 'cms-post', releaseURL: 'missing' }] })
        .mockResolvedValueOnce({ posts: [{ id: 'cms-post', releaseURL: 'https://www.facebook.com/page/posts/99' }] }),
    };
    const result = await publishPostizDigest({ id: 'd1', content: 'Текст' }, config, 'text', {
      client,
      sleepFn: vi.fn().mockResolvedValue(),
    });
    expect(result.posts[0].releaseURL).toBe('https://www.facebook.com/page/posts/99');
    expect(firstFacebookRelease(result.posts)).toBe('https://www.facebook.com/page/posts/99');
  });

  it('fills a missing Facebook URL from Graph permalink lookup', async () => {
    const client = {
      integrations: vi.fn().mockResolvedValue([{ id: 'fb-1', platform: 'facebook' }]),
      createPost: vi.fn().mockResolvedValue({ posts: [{ id: 'cms-post' }] }),
    };
    const result = await publishPostizDigest({ id: 'd1', content: 'Текст' }, config, 'text', {
      client,
      resolveFacebookPermalink: vi.fn().mockResolvedValue('https://www.facebook.com/111/posts/222'),
    });
    expect(result.posts[0].releaseURL).toBe('https://www.facebook.com/111/posts/222');
  });

  it('uploads video before creating a story and uses the story setting', async () => {
    const client = {
      integrations: vi.fn().mockResolvedValue([{ id: 'fb-1', identifier: 'facebook' }]),
      upload: vi.fn().mockResolvedValue({ id: 'upload-1', path: 'http://postiz/upload.mp4' }),
      createPost: vi.fn().mockResolvedValue({ posts: [{ id: 'story-1' }] }),
    };
    const trimStory = vi.fn().mockResolvedValue(Buffer.from('trimmed'));
    await publishPostizDigest({ id: 'd1', content: 'Текст', video_url: '/video.mp4' }, config, 'story', { client, trimStory });
    expect(trimStory).toHaveBeenCalledWith('/video.mp4');
    expect(client.upload).toHaveBeenCalledWith(Buffer.from('trimmed'), 'd1-story.mp4');
    expect(client.createPost.mock.calls[0][0][0].settings).toEqual({ __type: 'facebook', post_type: 'story' });
    expect(client.createPost.mock.calls[0][0][0].value[0].image)
      .toEqual([{ id: 'upload-1', path: 'http://postiz/upload.mp4' }]);
  });

  it('refuses a selected channel that is not connected', async () => {
    await expect(publishPostizDigest({ content: 'x' }, config, 'text', {
      client: { integrations: vi.fn().mockResolvedValue([{ id: 'other', platform: 'facebook' }]) },
    })).rejects.toThrow(/selected Postiz channels/);
  });
});

describe('waitForPostizReleaseUrl', () => {
  it('returns empty when Postiz never exposes an http URL', async () => {
    const url = await waitForPostizReleaseUrl(
      { listPosts: vi.fn().mockResolvedValue({ posts: [{ id: 'x', releaseURL: 'missing' }] }) },
      'x',
      { timeoutMs: 1, intervalMs: 1, sleepFn: vi.fn() },
    );
    expect(url).toBe('');
  });
});

describe('normalizeAnalytics', () => {
  it('normalizes Postiz metric points for sparklines', () => {
    expect(normalizeAnalytics({ data: [{ label: 'Likes', data: [{ date: 'today', total: '4' }] }] }))
      .toEqual([{ label: 'Likes', percentageChange: null, data: [{ date: 'today', total: 4 }] }]);
  });
});
