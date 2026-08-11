import { publishToFacebook } from './facebook.js';
import { publishImageToFacebook } from './facebook-image.js';
import { publishVideoToFacebook } from './facebook-video.js';
import { publishReelToFacebook } from './facebook-reel.js';
import { publishToTelegram } from './telegram.js';
import { publishToYouTube } from './youtube.js';
import { updateDigest } from '../../db/index.js';

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

  const allowed = ['content', 'status', 'generation_log', 'published_at',
    'facebook_post_id', 'telegram_message_id', 'youtube_post_id', 'articles_count',
    'model', 'input_tokens', 'output_tokens', 'cost_usd', 'video_url', 'reel_url'];
  const results = {
    facebook: null,
    facebookImage: null,
    facebookVideo: null,
    telegram: null,
    youtube: null,
  };

  const updateFields = {};
  // A URL rendered inside the MP4 is not clickable. Keep the link in the
  // Facebook Reel caption, where Facebook can turn it into an active link.
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

  // Construct caption for Facebook Reel.
  // Include FB logo emoji (📘) and a link to the parent site.
  // The link appears at the bottom of the caption for visibility.
  const fbLogo = '📘';
  const linkText = process.env.BASE_URL ? `${fbLogo} Більше новин тут: ${process.env.BASE_URL}` : '';
  const rawCaption = [
    digest.content,
    linkText,
  ].filter(Boolean).join('\n\n');
  const reelCaption = formatCaption(rawCaption);

  // Facebook
  if (shouldPublish('facebook') && config.facebookPageAccessToken && config.facebookPageId) {
    results.facebook = await publishToFacebook(
      config.facebookPageAccessToken,
      config.facebookPageId,
      digest.content,
    );
    if (results.facebook?.postId) {
      updateFields.facebook_post_id = results.facebook.postId;
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
      reelCaption,
    );
    if (results.facebookVideo?.videoId) {
      updateFields.facebook_post_id = results.facebookVideo.videoId;
    }
  }

  // Facebook Reel (short video with Reel flag)
  if (shouldPublish('facebook-reel') && config.facebookPageAccessToken && config.facebookPageId && digest.reel_url) {
    results.facebookReel = await publishReelToFacebook(
      config.facebookPageAccessToken,
      config.facebookPageId,
      digest.reel_url,
      reelCaption,
    );
    if (results.facebookReel?.reelId) {
      updateFields.facebook_post_id = results.facebookReel.reelId;
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

  // YouTube (placeholder)
  if (shouldPublish('youtube') && config.youtubeAccessToken && config.youtubeChannelId) {
    results.youtube = await publishToYouTube(
      config.youtubeAccessToken,
      config.youtubeChannelId,
      digest.content,
    );
    if (results.youtube?.postId) {
      updateFields.youtube_post_id = results.youtube.postId;
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
