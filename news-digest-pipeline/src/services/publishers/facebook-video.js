/**
 * Facebook Video/Reel Publisher.
 * Publishes a video (Reel) with a caption to a Facebook page.
 * Supports the video/audio pipeline approach.
 */

export async function publishVideoToFacebook(pageAccessToken, pageId, videoUrl, description) {
  if (!pageAccessToken || !pageId) {
    const errMsg = '[facebook-video] Missing pageAccessToken or pageId';
    console.error(errMsg);
    return { error: errMsg };
  }

  if (!videoUrl) {
    const errMsg = '[facebook-video] Missing videoUrl';
    console.error(errMsg);
    return { error: errMsg };
  }

  try {
    // Facebook Video API: POST /{page-id}/videos
    // For Reels, Facebook recommends using the specialized Reels API, 
    // but the standard /videos endpoint works for general video posts with captions.
    const response = await fetch(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_url: videoUrl,
        description: description,
        access_token: pageAccessToken,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errorMessage = data.error?.message || JSON.stringify(data);
      console.error('[facebook-video] API error:', errorMessage);
      return { error: `[facebook-video] API error: ${errorMessage}` };
    }

    return { 
      videoId: data.id,
      fbId: data.fb_id
    };
  } catch (err) {
    const errorMessage = `[facebook-video] Network/Error publishing: ${err.message}`;
    console.error(errorMessage);
    return { error: errorMessage };
  }
}
