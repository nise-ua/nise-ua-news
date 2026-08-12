/**
 * Facebook publisher.
 * Publishes digest content to a Facebook page feed.
 */

import { verifyPublishedFacebookPost } from './facebook-visibility.js';

export async function publishToFacebook(pageAccessToken, pageId, content) {
  if (!pageAccessToken || !pageId) {
    const errMsg = '[facebook] Missing pageAccessToken or pageId';
    console.error(errMsg);
    return { error: errMsg };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: content,
        access_token: pageAccessToken,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errorMessage = data.error?.message || JSON.stringify(data);
      console.error('[facebook] API error:', errorMessage);
      return { error: `[facebook] API error: ${errorMessage}` };
    }

    const postId = data.id;
    const visibility = await verifyPublishedFacebookPost(pageAccessToken, pageId, postId);
    return { postId, visibility };
  } catch (err) {
    const errorMessage = `[facebook] Network/Error publishing: ${err.message}`;
    console.error(errorMessage);
    return { error: errorMessage };
  }
}
