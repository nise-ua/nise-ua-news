import { publishToFacebook } from './facebook.js';
import { publishImageToFacebook } from './facebook-image.js';
import { publishVideoToFacebook } from './facebook-video.js';
import { publishReelToFacebook } from './facebook-reel.js';
import { publishStoryToFacebook } from './facebook-story.js';
import { publishToTelegram } from './telegram.js';
import { publishToYouTube } from './youtube.js';
import { updateDigest } from '../../db/index.js';
import { buildReelCaption } from './facebook-caption.js';
import { digestVideoUrl, localVideoPathFromUrl } from './facebook-video-file.js';

/**
 * Publish a digest to selected platforms.
 *
 * @param {Object} digest     - Digest record from DB (must have id and content)
 * @param {Object} config     - App config object
 * @param {string[]} platforms - Optional: ["telegram", "facebook", "youtube"]. If omitted, publishes to all enabled.
 * @returns {{ facebook, telegram, youtube }} results per platform (or null if skipped)
 */
export async function publishDigest(digest, config, platforms) {
  const all = !platforms || !Array.isArray(platforms) || platforms.length === 0;
  const shouldPublish = (name) => all || platforms.includes(name);

  const results = {
    facebook: null,
    facebookImage: null,
    facebookVideo: null,
    facebookReel: null,
    facebookStory: null,
    telegram: null,
    youtube: null,
  };

  const updateFields = {};
  // Helper to ensure caption sentences are capitalized and end with punctuation.
  function formatCaption(text) {
    if (!text) return '';
    // Split into sentences using punctuation marks.
    const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    const formatted = sentences.map(s => {
      const capitalized = s[0].toUpperCase() + s.slice(1);
      return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
    });
    return formatted.join(' ');
  }

  const videoCaption = formatCaption(digest.content);

  // Facebook
  if (shouldPublish('facebook') && config.facebookPageAccessToken && config.facebookPageId) {
    results.facebook = await publishToFacebook(
      config.facebookPageAccessToken,
      config.facebookPageId,
      digest.content,
    );
    if (results.facebook?.postId) {
      updateFields.facebook_post_id = results.facebook.postId;
      // visibility is attached by publishToFacebook; surface a soft warning only
      if (results.facebook.visibility && results.facebook.visibility.ok === false) {
        console.warn(
          '[publish] Facebook post may be invisible to other users:',
          results.facebook.visibility.reasons?.join('; ') || results.facebook.visibility.error,
        );
      }
    }
  }

  // Facebook Image (New approach similar to Instagram)
  if (shouldPublish('facebook-image') && config.facebookPageAccessToken && config.facebookPageId && digest.image_url) {
    results.facebookImage = await publishImageToFacebook(
      config.facebookPageAccessToken,
      config.facebookPageId,
      digest.image_url,
      digest.content,
    );
    if (results.facebookImage?.postId) {
      updateFields.facebook_post_id = results.facebookImage.postId;
    }
  }

  // Facebook Video (Reels/Video approach)
  if (shouldPublish('facebook-video') && config.facebookPageAccessToken && config.facebookPageId && digest.video_url) {
    results.facebookVideo = await publishVideoToFacebook(
      config.facebookPageAccessToken,
      config.facebookPageId,
      digest.video_url,
      videoCaption,
    );
    if (results.facebookVideo?.videoId) {
      updateFields.facebook_post_id = results.facebookVideo.videoId;
    }
  }

  // Facebook Reel (short video) + Story. Uses the digest video, not a separate reel_url.
  if (shouldPublish('facebook-reel')) {
    const videoUrl = digestVideoUrl(digest);
    if (!config.facebookPageAccessToken || !config.facebookPageId) {
      results.facebookReel = { error: '[facebook-reel] Missing pageAccessToken or pageId' };
    } else if (!videoUrl) {
      results.facebookReel = { error: '[facebook-reel] No digest video. Generate the video first.' };
    } else if (!digest.facebook_post_id) {
      results.facebookReel = { error: '[facebook-reel] Publish the Facebook digest post first so the reel caption can link to it.' };
    } else {
      const reelCaption = buildReelCaption({
        pageId: config.facebookPageId,
        facebookPostId: digest.facebook_post_id,
      });
      results.facebookReel = await publishReelToFacebook(
        config.facebookPageAccessToken,
        config.facebookPageId,
        videoUrl,
        reelCaption,
      );
      if (results.facebookReel?.reelId) {
        updateFields.facebook_reel_id = String(results.facebookReel.reelId);
        results.facebookStory = await publishStoryToFacebook(
          config.facebookPageAccessToken,
          config.facebookPageId,
          videoUrl,
        );
        if (results.facebookStory?.storyId) {
          updateFields.facebook_story_id = String(results.facebookStory.storyId);
        }
      }
    }
  }

  // Telegram (publish to channel, not personal chat)
  if (shouldPublish('telegram')) {
    const tgPublishChat = config.telegramPublishChatId || config.telegramChatId;
    if (config.telegramBotToken && tgPublishChat) {
      results.telegram = await publishToTelegram(
        config.telegramBotToken,
        tgPublishChat,
        digest.content,
      );
      if (results.telegram?.messageId) {
        updateFields.telegram_message_id = String(results.telegram.messageId);
      }
    }
  }

  // YouTube
  if (shouldPublish('youtube')) {
    const youtubeShortsPath = localVideoPathFromUrl(digest.youtube_shorts_url);
    if (!config.youtubeClientId || !config.youtubeClientSecret || !config.youtubeRefreshToken) {
      results.youtube = { error: '[youtube] Missing YouTube OAuth2 credentials or refresh token.' };
    } else if (!youtubeShortsPath) {
      results.youtube = { error: '[youtube] No YouTube Shorts video. Generate the Shorts video first.' };
    } else {
      const date = new Date(digest.date).toISOString().slice(0, 10); // YYYY-MM-DD
      const title = `NiSeNews · ${date} #Shorts`;
      let description = `${digest.content}\n\n#Shorts #новини #Україна`;
      if (digest.facebook_post_id) {
        description += `\n\nДивіться повний дайджест на Facebook: https://www.facebook.com/${config.facebookPageId}/posts/${digest.facebook_post_id}/`;
      }

      results.youtube = await publishToYouTube(
        youtubeShortsPath,
        title,
        description,
        config.youtubePrivacyStatus,
      );
      if (results.youtube?.videoId) {
        updateFields.youtube_post_id = results.youtube.videoId;
      }
    }
  }

  // Update digest record with post IDs and mark as published
  const hasAnyResult = Object.keys(updateFields).length > 0;
  if (hasAnyResult) {
    updateFields.status = 'published';
    updateFields.published_at = new Date().toISOString();
    updateDigest(digest.id, updateFields);
  }

  return results;
}
