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
import { publishToFacebook } from './facebook.js';
import { publishReelToFacebook } from './facebook-reel.js';
import { publishStoryToFacebook } from './facebook-story.js';
import { publishDigest } from './index.js';

const config = {
  facebookPageAccessToken: 'token',
  facebookPageId: '111',
  facebookPageName: 'Nise-ua',
  facebookBrowserProfileDir: '/tmp/fb-page-profile',
  facebookBrowserTimezone: 'America/New_York',
};

const digest = {
  id: 'digest-1',
  content: 'Дайджест текст',
  video_url: 'https://example.com/videos/reel_1.mp4',
  facebook_post_id: '111_222',
};

describe('publishDigest facebook text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishToFacebook.mockResolvedValue({ postId: '111_999', via: 'browser' });
  });

  it('publishes Page text via the composer publisher', async () => {
    const results = await publishDigest(digest, config, ['facebook']);
    expect(publishToFacebook).toHaveBeenCalledWith(
      'token',
      '111',
      'Дайджест текст',
      {
        pageName: 'Nise-ua',
        profileDir: '/tmp/fb-page-profile',
        timezoneId: 'America/New_York',
      },
    );
    expect(results.facebook).toEqual({ postId: '111_999', via: 'browser' });
    expect(updateDigest).toHaveBeenCalledWith('digest-1', expect.objectContaining({
      facebook_post_id: '111_999',
      status: 'published',
    }));
  });
});

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

describe('publishDigest youtube', () => {
  const youtubeConfig = {
    ...config,
    youtubeClientId: 'yt-client-id',
    youtubeClientSecret: 'yt-client-secret',
    youtubeRefreshToken: 'yt-refresh-token',
    youtubeChannelId: 'yt-channel-id',
    youtubePrivacyStatus: 'unlisted',
  };

  const shortsDigest = {
    id: 'digest-2',
    content: 'YouTube Shorts content',
    youtube_shorts_url: 'https://example.com/shorts/shorts_1.mp4',
    facebook_post_id: 'fb_post_123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mock('../youtube.js', () => ({ publishToYouTube: vi.fn(() => ({ videoId: 'yt-video-1', url: 'https://youtube.com/shorts/yt-video-1' })) }));
    vi.mock('../facebook-video-file.js', () => ({
      digestVideoUrl: vi.fn(),
      localVideoPathFromUrl: vi.fn((url) => url.includes('shorts_1.mp4') ? './path/to/shorts_1.mp4' : null),
    }));
  });

  it('publishes YouTube Shorts with correct metadata', async () => {
    const { publishToYouTube } = await import('../youtube.js');
    const results = await publishDigest(shortsDigest, youtubeConfig, ['youtube']);

    expect(publishToYouTube).toHaveBeenCalledWith(
      './path/to/shorts_1.mp4',
      'NiSeNews · 1970-01-01 #Shorts',
      'YouTube Shorts content\n\n#Shorts #новини #Україна\n\nДивіться повний дайджест на Facebook: https://www.facebook.com/111/posts/fb_post_123/',
      'unlisted',
    );
    expect(results.youtube).toEqual({ videoId: 'yt-video-1', url: 'https://youtube.com/shorts/yt-video-1' });
    expect(updateDigest).toHaveBeenCalledWith('digest-2', expect.objectContaining({
      youtube_post_id: 'yt-video-1',
      status: 'published',
    }));
  });

  it('publishes YouTube Shorts without Facebook permalink if facebook_post_id is missing', async () => {
    const { publishToYouTube } = await import('../youtube.js');
    const digestWithoutFbPost = { ...shortsDigest, facebook_post_id: null };
    const results = await publishDigest(digestWithoutFbPost, youtubeConfig, ['youtube']);

    expect(publishToYouTube).toHaveBeenCalledWith(
      './path/to/shorts_1.mp4',
      'NiSeNews · 1970-01-01 #Shorts',
      'YouTube Shorts content\n\n#Shorts #новини #Україна',
      'unlisted',
    );
    expect(results.youtube).toEqual({ videoId: 'yt-video-1', url: 'https://youtube.com/shorts/yt-video-1' });
  });

  it('guards against missing YouTube Shorts video', async () => {
    const { publishToYouTube } = await import('../youtube.js');
    const digestWithoutShorts = { ...shortsDigest, youtube_shorts_url: null };
    const results = await publishDigest(digestWithoutShorts, youtubeConfig, ['youtube']);

    expect(results.youtube.error).toMatch(/No YouTube Shorts video/);
    expect(publishToYouTube).not.toHaveBeenCalled();
    expect(updateDigest).not.toHaveBeenCalled();
  });

  it('guards against missing YouTube OAuth2 credentials', async () => {
    const { publishToYouTube } = await import('../youtube.js');
    const configWithoutYtCreds = { ...youtubeConfig, youtubeClientId: null };
    const results = await publishDigest(shortsDigest, configWithoutYtCreds, ['youtube']);

    expect(results.youtube.error).toMatch(/Missing YouTube OAuth2 credentials/);
    expect(publishToYouTube).not.toHaveBeenCalled();
    expect(updateDigest).not.toHaveBeenCalled();
  });
});
