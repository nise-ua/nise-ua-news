/**
 * Identify Facebook Page posts created in the composer (not Graph /feed).
 * Composer posts have no `application` / `admin_creator` app fingerprint.
 */

const GRAPH = 'https://graph.facebook.com/v19.0';

export function fingerprintMessage(text, len = 80) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, len)
    .toLowerCase();
}

export function isBrowserComposerPost(post, pageId) {
  if (!post || typeof post !== 'object') return false;
  if (post.application?.id || post.application?.name) return false;
  if (post.admin_creator?.id || post.admin_creator?.name) return false;
  if (pageId && post.from?.id && String(post.from.id) !== String(pageId)) return false;
  return true;
}

export function messagesMatch(posted, expected) {
  const a = fingerprintMessage(posted, 60);
  const b = fingerprintMessage(expected, 60);
  if (!a || !b) return false;
  const short = a.slice(0, 40);
  return a === b || a.startsWith(b.slice(0, 40)) || b.startsWith(short);
}

/**
 * @param {object[]} posts
 * @param {{ content: string, pageId?: string, maxAgeMs?: number, now?: number }} opts
 */
export function pickLatestMatchingBrowserPost(posts, {
  content,
  pageId,
  maxAgeMs = 5 * 60 * 1000,
  now = Date.now(),
} = {}) {
  const list = Array.isArray(posts) ? posts : [];
  const candidates = list.filter((post) => {
    if (!isBrowserComposerPost(post, pageId)) return false;
    if (post.status_type && post.status_type !== 'mobile_status_update') return false;
    const created = Date.parse(post.created_time);
    if (!Number.isFinite(created) || now - created > maxAgeMs || created > now + 30_000) {
      return false;
    }
    return messagesMatch(post.message || '', content || '');
  });
  candidates.sort((a, b) => Date.parse(b.created_time) - Date.parse(a.created_time));
  return candidates[0] || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * After a composer publish, find the new Page post via Graph.
 */
export async function resolveLatestBrowserPost(pageAccessToken, pageId, content, {
  fetchImpl = fetch,
  sleepFn = sleep,
  attempts = 5,
} = {}) {
  if (!pageAccessToken || !pageId) {
    return { error: '[facebook-page-browser] Missing pageAccessToken or pageId to resolve post id' };
  }

  const fields = [
    'id',
    'message',
    'created_time',
    'application',
    'admin_creator',
    'from',
    'permalink_url',
    'status_type',
    'privacy',
    'is_published',
    'is_hidden',
  ].join(',');

  let lastError = '';
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleepFn(2000);
    const url = `${GRAPH}/${pageId}/published_posts?fields=${fields}&limit=8&access_token=${encodeURIComponent(pageAccessToken)}`;
    const res = await fetchImpl(url);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      lastError = json.error?.message || `HTTP ${res.status}`;
      continue;
    }
    const match = pickLatestMatchingBrowserPost(json.data, { content, pageId });
    if (match) {
      return {
        postId: match.id,
        permalinkUrl: match.permalink_url || null,
        application: match.application || null,
        from: match.from || null,
        raw: match,
      };
    }
    lastError = 'No matching composer post yet';
  }

  return {
    error: `[facebook-page-browser] Could not find a browser composer post after publishing (${lastError})`,
  };
}
