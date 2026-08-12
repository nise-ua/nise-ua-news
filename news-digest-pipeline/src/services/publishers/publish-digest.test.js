import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({
  updateDigest: vi.fn(),
}));
vi.mock('./facebook.js', () => ({ publishToFacebook: vi.fn() }));
vi.mock('./facebook-image.js', () => ({ publishImageToFacebook: vi.fn() }));
vi.mock('./facebook-video.js', () => ({ publishVideoToFacebook: vi.fn() }));
vi.mock('./facebook-reel.js', () => ({ publishReelToFacebook: vi.fn() }));
vi.mock('./facebook-story.js', () => ({ publishStoryToFacebook: vi.fn() }));
vi.mock('./telegram.js', () => ({ publishToTelegram: vi.fn() }));
vi.mock('./youtube.js', () => ({ publishToYouTube: vi.fn() }));

import { updateDigest } from '../../db/index.js';
import { publishReelToFacebook } from './facebook-reel.js';
import { publishStoryToFacebook } from './facebook-story.js';
import { publishDigest } from './index.js';

const config = {
  facebookPageAccessToken: 'token',
  facebookPageId: '111',
};

const digest = {
  id: 'digest-1',
  content: 'Дайджест текст',
  video_url: 'https://example.com/videos/reel_1.mp4',
  facebook_post_id: '111_222',
};

describe('publishDigest facebook-reel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishReelToFacebook.mockResolvedValue({ reelId: 'reel-9' });
    publishStoryToFacebook.mockResolvedValue({ storyId: 'story-8' });
  });

  it('publishes the digest video as a reel with a Facebook post link, then as a story', async () => {
    const results = await publishDigest(digest, config, ['facebook-reel']);

    expect(publishReelToFacebook).toHaveBeenCalledWith(
      'token',
      '111',
      'https://example.com/videos/reel_1.mp4',
      '📘 Більше новин тут: https://www.facebook.com/111/posts/222',
    );
    expect(publishStoryToFacebook).toHaveBeenCalledWith(
      'token',
      '111',
      'https://example.com/videos/reel_1.mp4',
    );
    expect(results.facebookReel).toEqual({ reelId: 'reel-9' });
    expect(results.facebookStory).toEqual({ storyId: 'story-8' });
    expect(updateDigest).toHaveBeenCalledWith('digest-1', expect.objectContaining({
      facebook_reel_id: 'reel-9',
      facebook_story_id: 'story-8',
      status: 'published',
    }));
    expect(updateDigest.mock.calls[0][1].facebook_post_id).toBeUndefined();
  });

  it('requires a digest video', async () => {
    const results = await publishDigest(
      { ...digest, video_url: null, reel_url: null },
      config,
      ['facebook-reel'],
    );
    expect(results.facebookReel.error).toMatch(/No digest video/);
    expect(publishReelToFacebook).not.toHaveBeenCalled();
    expect(updateDigest).not.toHaveBeenCalled();
  });

  it('requires an already-published Facebook digest post', async () => {
    const results = await publishDigest(
      { ...digest, facebook_post_id: null },
      config,
      ['facebook-reel'],
    );
    expect(results.facebookReel.error).toMatch(/Publish the Facebook digest post first/);
    expect(publishReelToFacebook).not.toHaveBeenCalled();
  });

  it('still saves the reel id if story publishing fails', async () => {
    publishStoryToFacebook.mockResolvedValue({ error: 'story failed' });
    const results = await publishDigest(digest, config, ['facebook-reel']);
    expect(results.facebookReel).toEqual({ reelId: 'reel-9' });
    expect(results.facebookStory).toEqual({ error: 'story failed' });
    expect(updateDigest).toHaveBeenCalledWith('digest-1', expect.objectContaining({
      facebook_reel_id: 'reel-9',
    }));
    expect(updateDigest.mock.calls[0][1].facebook_story_id).toBeUndefined();
  });
});
