/**
 * Facebook Image Publisher.
 * Publishes an image with a caption to a Facebook page.
 * Uses the same approach as the Instagram pipeline.
 */

export async function publishImageToFacebook(pageAccessToken, pageId, imageUrl, caption) {
  if (!pageAccessToken || !pageId) {
    const errMsg = '[facebook-image] Missing pageAccessToken or pageId';
    console.error(errMsg);
    return { error: errMsg };
  }

  if (!imageUrl) {
    const errMsg = '[facebook-image] Missing imageUrl';
    console.error(errMsg);
    return { error: errMsg };
  }

  try {
    // Facebook API for photos: POST /{page-id}/photos
    // Requires either a 'url' (publicly accessible) or multipart/form-data upload
    const response = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: imageUrl,
        caption: caption,
        access_token: pageAccessToken,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errorMessage = data.error?.message || JSON.stringify(data);
      console.error('[facebook-image] API error:', errorMessage);
      return { error: `[facebook-image] API error: ${errorMessage}` };
    }

    // Success response for photos includes 'id' and 'post_id'
    return { 
      photoId: data.id,
      postId: data.post_id 
    };
  } catch (err) {
    const errorMessage = `[facebook-image] Network/Error publishing: ${err.message}`;
    console.error(errorMessage);
    return { error: errorMessage };
  }
}
