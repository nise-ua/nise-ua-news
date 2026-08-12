/**
 * Facebook Reel Publisher.
 * Publishes a short video as a Reel on a Facebook Page with a caption.
 * URLs must be included in the caption; text inside the MP4 cannot be clickable.
 */
import { loadVideoBuffer } from './facebook-video-file.js';
import { finishPageVideoUpload, startPageVideoUpload, uploadPageVideoBytes } from './facebook-video-upload.js';

export async function publishReelToFacebook(pageAccessToken, pageId, videoUrl, caption) {
  if (!pageAccessToken || !pageId) {
    const errMsg = '[facebook-reel] Missing pageAccessToken or pageId';
    console.error(errMsg);
    return { error: errMsg };
  }

  if (!videoUrl) {
    const errMsg = '[facebook-reel] Missing videoUrl';
    console.error(errMsg);
    return { error: errMsg };
  }

  try {
    const { buffer } = await loadVideoBuffer(videoUrl);
    const { videoId, uploadUrl } = await startPageVideoUpload({
      pageAccessToken,
      pageId,
      edge: 'video_reels',
    });

    await uploadPageVideoBytes({ pageAccessToken, uploadUrl, videoBuffer: buffer });

    const finishData = await finishPageVideoUpload({
      pageAccessToken,
      pageId,
      edge: 'video_reels',
      videoId,
      extra: {
        video_state: 'PUBLISHED',
        description: caption || '',
      },
    });

    return {
      reelId: finishData.id || finishData.video_id || videoId,
      videoId,
      success: finishData.success !== false,
    };
  } catch (err) {
    const errorMessage = `[facebook-reel] ${err.message}`;
    console.error(errorMessage);
    return { error: errorMessage };
  }
}
