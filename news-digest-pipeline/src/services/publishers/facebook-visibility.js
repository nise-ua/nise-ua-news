/**
 * Facebook post visibility checks.
 *
 * After publish, the page token can always read the author's own post even when
 * Meta has silently restricted it for other users ("Couldn't Load Post").
 * These helpers surface privacy / hide / publish flags so the dashboard can
 * warn before the same failure is discovered from another account.
 */

const GRAPH = 'https://graph.facebook.com/v19.0';

function normalizePostId(postId, pageId) {
  const id = String(postId || '').trim();
  if (!id) return '';
  if (id.includes('_')) return id;
  if (pageId) return `${pageId}_${id}`;
  return id;
}

function privacyIsPublic(privacy) {
  if (!privacy || typeof privacy !== 'object') return null;
  const value = String(privacy.value || privacy.description || '').toLowerCase();
  if (!value) return null;
  if (value === 'everyone' || value === 'public') return true;
  return false;
}

/**
 * Inspect a Facebook Page post for flags that explain other-user load failures.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   postId: string,
 *   isPublished: boolean|null,
 *   isHidden: boolean|null,
 *   privacyPublic: boolean|null,
 *   permalinkUrl: string|null,
 *   reasons: string[],
 *   raw?: object,
 *   error?: string,
 * }>}
 */
export async function checkFacebookPostVisibility(pageAccessToken, pageId, postId) {
  const normalizedId = normalizePostId(postId, pageId);
  if (!pageAccessToken || !normalizedId) {
    return {
      ok: false,
      postId: normalizedId,
      isPublished: null,
      isHidden: null,
      privacyPublic: null,
      permalinkUrl: null,
      reasons: ['Missing pageAccessToken or postId'],
      error: '[facebook-visibility] Missing pageAccessToken or postId',
    };
  }

  const fields = [
    'id',
    'is_published',
    'is_hidden',
    'privacy',
    'permalink_url',
    'status_type',
    'created_time',
  ].join(',');

  try {
    const url = `${GRAPH}/${normalizedId}?fields=${fields}&access_token=${encodeURIComponent(pageAccessToken)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.error) {
      const errorMessage = data.error?.message || JSON.stringify(data);
      return {
        ok: false,
        postId: normalizedId,
        isPublished: null,
        isHidden: null,
        privacyPublic: null,
        permalinkUrl: null,
        reasons: [`Graph API error: ${errorMessage}`],
        error: `[facebook-visibility] ${errorMessage}`,
        raw: data,
      };
    }

    const isPublished = typeof data.is_published === 'boolean' ? data.is_published : null;
    const isHidden = typeof data.is_hidden === 'boolean' ? data.is_hidden : null;
    const privacyPublic = privacyIsPublic(data.privacy);
    const reasons = [];

    if (isPublished === false) {
      reasons.push('Post is not published (is_published=false)');
    }
    if (isHidden === true) {
      reasons.push('Post is hidden from the page timeline (is_hidden=true)');
    }
    if (privacyPublic === false) {
      reasons.push(`Post privacy is restricted (${data.privacy?.value || data.privacy?.description || 'non-public'})`);
    }

    // Page token can still read a silently restricted post. Warn when Graph
    // returns the object but other-user symptoms are likely.
    if (reasons.length === 0 && isPublished !== false && isHidden !== true && privacyPublic !== false) {
      // Soft note only — Graph cannot fully prove third-party reach.
      return {
        ok: true,
        postId: data.id || normalizedId,
        isPublished,
        isHidden,
        privacyPublic,
        permalinkUrl: data.permalink_url || null,
        reasons: [],
        raw: data,
      };
    }

    return {
      ok: reasons.length === 0,
      postId: data.id || normalizedId,
      isPublished,
      isHidden,
      privacyPublic,
      permalinkUrl: data.permalink_url || null,
      reasons,
      raw: data,
    };
  } catch (err) {
    return {
      ok: false,
      postId: normalizedId,
      isPublished: null,
      isHidden: null,
      privacyPublic: null,
      permalinkUrl: null,
      reasons: [`Network error: ${err.message}`],
      error: `[facebook-visibility] ${err.message}`,
    };
  }
}

/**
 * Log a human-readable visibility report after publish.
 * Does not throw — visibility failures must not roll back a successful publish.
 */
export async function verifyPublishedFacebookPost(pageAccessToken, pageId, postId, log = console) {
  const result = await checkFacebookPostVisibility(pageAccessToken, pageId, postId);
  if (result.error && !result.raw) {
    log.warn?.(`[facebook-visibility] Could not verify post ${result.postId}: ${result.error}`)
      || log.log(`[facebook-visibility] Could not verify post ${result.postId}: ${result.error}`);
    return result;
  }

  if (!result.ok) {
    const detail = result.reasons.join('; ') || result.error || 'unknown';
    log.warn?.(`[facebook-visibility] Post ${result.postId} may be invisible to other users: ${detail}`)
      || log.log(`[facebook-visibility] Post ${result.postId} may be invisible to other users: ${detail}`);
    return result;
  }

  log.log?.(
    `[facebook-visibility] Post ${result.postId} looks publicly readable`
    + (result.permalinkUrl ? ` (${result.permalinkUrl})` : ''),
  );
  return result;
}
