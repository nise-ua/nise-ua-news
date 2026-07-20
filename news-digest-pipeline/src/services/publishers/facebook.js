/**
 * Facebook publisher.
 * Publishes digest content to a Facebook page feed.
 */

export async function publishToFacebook(pageAccessToken, pageId, content) {
  if (!pageAccessToken || !pageId) {
    console.error('[facebook] Missing pageAccessToken or pageId');
    return null;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: content,
        access_token: pageAccessToken,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error('[facebook] API error:', data.error?.message || JSON.stringify(data));
      return null;
    }

    return { postId: data.id };
  } catch (err) {
    console.error('[facebook] Error publishing:', err.message);
    return null;
  }
}