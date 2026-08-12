/**
 * Facebook Reel caption helpers.
 * Reel description must link to the already-published digest feed post.
 */

export function buildFacebookPostPermalink(pageId, facebookPostId) {
  if (!facebookPostId) return '';
  const id = String(facebookPostId).trim();
  if (!id) return '';
  if (/^https?:\/\//i.test(id)) return id;

  if (id.includes('_')) {
    const [page, post] = id.split('_');
    if (page && post) return `https://www.facebook.com/${page}/posts/${post}`;
  }

  if (pageId) return `https://www.facebook.com/${pageId}/posts/${id}`;
  return `https://www.facebook.com/${id}`;
}

export function buildReelCaption({ pageId, facebookPostId } = {}) {
  const permalink = buildFacebookPostPermalink(pageId, facebookPostId);
  if (!permalink) return '';
  return `📘 Більше новин тут: ${permalink}`;
}
