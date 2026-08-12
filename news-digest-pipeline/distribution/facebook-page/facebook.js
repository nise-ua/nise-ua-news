/**
 * Facebook Page publisher.
 * Posts content to a Facebook Page via Graph API.
 */
export async function publishToFacebook(pageAccessToken, pageId, content) {
  if (!pageAccessToken || !pageId) {
    console.error('[facebook] Missing pageAccessToken or pageId');
    return null;
  }

  try {
    const url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Keep the message body only. An "AI published" prefix is a spam-filter
        // signal and can cause "Couldn't Load Post" for other users.
        message: content,
        access_token: pageAccessToken,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[facebook] API error:', data.error?.message || JSON.stringify(data));
      return null;
    }

    const postId = data.id;
    return {
      postId,
      url: `https://www.facebook.com/${postId.replace('_', '/posts/')}`,
    };
  } catch (err) {
    console.error('[facebook] Error publishing:', err.message);
    return null;
  }
}
