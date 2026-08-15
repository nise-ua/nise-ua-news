import { describe, expect, it, vi } from 'vitest';
import { normalizeAnalytics, publishPostizDigest } from './postiz.js';

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
  });

  it('uploads video before creating a story and uses the story setting', async () => {
    const client = {
      integrations: vi.fn().mockResolvedValue([{ id: 'fb-1', platform: 'facebook' }]),
      upload: vi.fn().mockResolvedValue({ url: 'http://postiz/upload.mp4' }),
      createPost: vi.fn().mockResolvedValue({ posts: [{ id: 'story-1' }] }),
    };
    const trimStory = vi.fn().mockResolvedValue(Buffer.from('trimmed'));
    await publishPostizDigest({ id: 'd1', content: 'Текст', video_url: '/video.mp4' }, config, 'story', { client, trimStory });
    expect(trimStory).toHaveBeenCalledWith('/video.mp4');
    expect(client.upload).toHaveBeenCalledWith(Buffer.from('trimmed'), 'd1-story.mp4');
    expect(client.createPost.mock.calls[0][0][0].settings).toEqual({ __type: 'facebook', post_type: 'story' });
  });

  it('refuses a selected channel that is not connected', async () => {
    await expect(publishPostizDigest({ content: 'x' }, config, 'text', {
      client: { integrations: vi.fn().mockResolvedValue([{ id: 'other', platform: 'facebook' }]) },
    })).rejects.toThrow(/selected Postiz channels/);
  });
});

describe('normalizeAnalytics', () => {
  it('normalizes Postiz metric points for sparklines', () => {
    expect(normalizeAnalytics({ data: [{ label: 'Likes', data: [{ date: 'today', total: '4' }] }] }))
      .toEqual([{ label: 'Likes', percentageChange: null, data: [{ date: 'today', total: 4 }] }]);
  });
});
