/**
 * Facebook Reel Publisher.
 * Publishes a short video as a Reel on a Facebook Page with a caption.
 * URLs must be included in the caption; text inside the MP4 cannot be clickable.
 */
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
    // 2️⃣ Fetch video bytes from public reel URL
    const videoResp = await fetch(videoUrl);
    if (!videoResp.ok) {
      const msg = `Failed to fetch video (${videoResp.status})`;
      console.error('[facebook-reel] Video fetch error:', msg);
      return { error: `[facebook-reel] Video fetch error: ${msg}` };
    }
    const videoBuffer = await videoResp.arrayBuffer();

    // 1️⃣ Start upload session
    const startRes = await fetch(`https://graph.facebook.com/v26.0/${pageId}/video_reels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_phase: 'start',
        access_token: pageAccessToken,
      }),
    });
    if (!startRes.ok) {
      const errText = await startRes.text();
      console.error('[facebook-reel] Start phase error:', errText);
      return { error: `[facebook-reel] Start phase error: ${errText}` };
    }
    const startData = await startRes.json();
    const uploadUrl = startData.upload_url || (startData.upload_session_id && `https://rupload.facebook.com/video-upload/v26.0/${startData.upload_session_id}`);
    const videoId = startData.video_id || startData.id;
    if (!uploadUrl || !videoId) {
      console.error('[facebook-reel] Invalid start response:', JSON.stringify(startData));
      return { error: `[facebook-reel] Invalid start response: ${JSON.stringify(startData)}` };
    }

    // 3️⃣ Upload video binary to the provided upload_url
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 
        'Authorization': `OAuth ${pageAccessToken}`,
        'file_offset': '0',
        'Content-Type': 'video/mp4' 
      },
      body: Buffer.from(videoBuffer),
    });
    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('[facebook-reel] Upload phase error:', errText);
      return { error: `[facebook-reel] Upload phase error: ${errText}` };
    }

    // 4️⃣ Finish upload and publish Reel
    const finishRes = await fetch(`https://graph.facebook.com/v26.0/${pageId}/video_reels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_phase: 'finish',
        video_id: videoId,
        description: caption,
        short_video: true,
        access_token: pageAccessToken,
      }),
    });
    const finishData = await finishRes.json();
    if (!finishRes.ok || finishData.error) {
      const msg = finishData.error?.message || JSON.stringify(finishData);
      console.error('[facebook-reel] Finish phase error:', msg, 'Status:', finishRes.status);
      return { error: `[facebook-reel] API error: ${msg} (status ${finishRes.status})` };
    }
    return { reelId: finishData.id };
  } catch (err) {
    const errorMessage = `[facebook-reel] Network/Error publishing: ${err.message}`;
    console.error(errorMessage);
    return { error: errorMessage };
  }
}
