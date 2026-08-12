/**
 * Shared 3-phase Facebook Page video upload (Reels + Stories).
 */
export const GRAPH_VERSION = 'v26.0';

function graphUrl(pageId, edge) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/${edge}`;
}

export async function startPageVideoUpload({ pageAccessToken, pageId, edge }) {
  const startRes = await fetch(graphUrl(pageId, edge), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upload_phase: 'start',
      access_token: pageAccessToken,
    }),
  });
  const startText = await startRes.text();
  let startData = {};
  try {
    startData = startText ? JSON.parse(startText) : {};
  } catch {
    startData = { raw: startText };
  }
  if (!startRes.ok || startData.error) {
    const msg = startData.error?.message || startText || JSON.stringify(startData);
    throw new Error(`Start phase error: ${msg}`);
  }

  const videoId = startData.video_id || startData.id;
  const uploadUrl = startData.upload_url
    || (startData.upload_session_id && `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}/${startData.upload_session_id}`)
    || (videoId && `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}/${videoId}`);
  if (!uploadUrl || !videoId) {
    throw new Error(`Invalid start response: ${JSON.stringify(startData)}`);
  }
  return { videoId, uploadUrl };
}

export async function uploadPageVideoBytes({ pageAccessToken, uploadUrl, videoBuffer }) {
  const body = Buffer.isBuffer(videoBuffer) ? videoBuffer : Buffer.from(videoBuffer);
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${pageAccessToken}`,
      offset: '0',
      file_size: String(body.length),
    },
    body,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Upload phase error: ${errText}`);
  }
  return uploadRes;
}

export async function finishPageVideoUpload({ pageAccessToken, pageId, edge, videoId, extra = {} }) {
  const finishRes = await fetch(graphUrl(pageId, edge), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upload_phase: 'finish',
      video_id: videoId,
      access_token: pageAccessToken,
      ...extra,
    }),
  });
  const finishData = await finishRes.json().catch(() => ({}));
  if (!finishRes.ok || finishData.error) {
    const msg = finishData.error?.message || JSON.stringify(finishData);
    throw new Error(`Finish phase error: ${msg} (status ${finishRes.status})`);
  }
  return finishData;
}
