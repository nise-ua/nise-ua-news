import { buildReelCaption } from './facebook-caption.js';
import { digestVideoUrl, loadVideoBuffer } from './facebook-video-file.js';
import { bufferForFacebookStory } from './facebook-story.js';

const API_PATH = '/api/public/v1';

function apiBase(url) {
  return `${String(url || '').replace(/\/+$/, '')}${API_PATH}`;
}

async function readJson(response) {
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    throw new Error(`Postiz API ${response.status}: ${body?.message || body?.error || text || 'request failed'}`);
  }
  return body;
}

export function createPostizClient({ apiUrl, apiKey, fetchImpl = globalThis.fetch } = {}) {
  if (!apiUrl || !apiKey) throw new Error('Postiz URL and API key are required');
  const headers = { Authorization: apiKey };
  return {
    async integrations() {
      const response = await fetchImpl(`${apiBase(apiUrl)}/integrations`, { headers });
      const body = await readJson(response);
      return Array.isArray(body) ? body : body.integrations || body.data || [];
    },
    async upload(buffer, filename = 'digest.mp4') {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: 'video/mp4' }), filename);
      const response = await fetchImpl(`${apiBase(apiUrl)}/upload`, {
        method: 'POST',
        headers,
        body: form,
      });
      return readJson(response);
    },
    async createPost(posts, { date = new Date().toISOString(), shortLink = false, tags = [] } = {}) {
      const response = await fetchImpl(`${apiBase(apiUrl)}/posts`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'now',
          date,
          shortLink,
          tags,
          posts,
        }),
      });
      return readJson(response);
    },
    async listPosts({ startDate, endDate }) {
      const query = new URLSearchParams({ startDate, endDate });
      const response = await fetchImpl(`${apiBase(apiUrl)}/posts?${query}`, { headers });
      return readJson(response);
    },
    async postAnalytics(postId, days = 7) {
      const response = await fetchImpl(
        `${apiBase(apiUrl)}/analytics/post/${encodeURIComponent(postId)}?date=${days}`,
        { headers },
      );
      return readJson(response);
    },
  };
}

function uploadUrl(uploaded) {
  return uploaded?.path || uploaded?.url || uploaded?.file?.path || uploaded?.file?.url
    || uploaded?.data?.path || uploaded?.data?.url || uploaded?.id;
}

function postIdOf(result) {
  return result?.id || result?.postId || result?.post_id || result?.data?.id
    || result?.posts?.[0]?.id || result?.posts?.[0]?.postId || null;
}

export function isHttpUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) && !/^missing$/i.test(url);
}

function releaseUrlOf(result) {
  const raw = result?.releaseURL || result?.releaseUrl || result?.release_url
    || result?.data?.releaseURL || result?.data?.releaseUrl || '';
  return isHttpUrl(raw) ? String(raw).trim() : '';
}

function collectPosts(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.posts)) return body.posts;
  if (Array.isArray(body?.data)) return body.data;
  return body ? [body] : [];
}

function normalizePlatform(value) {
  return String(value || '').trim().toLowerCase();
}

export async function waitForPostizReleaseUrl(client, postId, {
  timeoutMs = 20000,
  intervalMs = 2000,
  now = () => new Date(),
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (!postId || typeof client?.listPosts !== 'function') return '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const startDate = new Date(now().getTime() - 6 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(now().getTime() + 60 * 60 * 1000).toISOString();
    const listed = collectPosts(await client.listPosts({ startDate, endDate }));
    const found = listed.find((post) => String(post.id || post.postId || '') === String(postId));
    const url = releaseUrlOf(found);
    if (url) return url;
    if (Date.now() + intervalMs > deadline) break;
    await sleepFn(intervalMs);
  }
  return '';
}

export function normalizeAnalytics(body) {
  const series = Array.isArray(body) ? body : body?.data || body?.analytics || [];
  return (Array.isArray(series) ? series : []).map((metric) => ({
    label: metric.label || metric.name || 'metric',
    percentageChange: metric.percentageChange ?? null,
    data: (metric.data || []).map((point) => ({
      date: point.date,
      total: Number(point.total ?? point.value ?? 0),
    })),
  }));
}

function mediaValue(content, mediaUpload) {
  const mediaObj = mediaUpload ? [{ id: String(mediaUpload.id || ''), path: String(mediaUpload.path || mediaUpload.url || '') }] : [];
  return {
    content: content || '',
    image: mediaObj,
  };
}

function providerSettings(platform, kind) {
  const settings = { __type: platform };
  if (platform === 'facebook' || platform === 'instagram') {
    settings.post_type = kind === 'story' ? 'story' : 'post';
  }
  return settings;
}

function captionFor(digest, kind, config) {
  if (kind === 'reel' && digest.facebook_post_id) {
    return buildReelCaption({
      pageId: config.facebookPageId,
      facebookPostId: digest.facebook_post_id,
    });
  }
  return String(digest.content || '').trim();
}

/**
 * Publish one digest kind to the configured Postiz integration allowlist.
 * This function intentionally has no live Postiz defaults; callers provide
 * credentials and tests inject a fake client.
 */
export async function publishPostizDigest(digest, config, kind, {
  client = createPostizClient({ apiUrl: config.postizApiUrl, apiKey: config.postizApiKey }),
  integrations,
  trimStory = bufferForFacebookStory,
  resolveFacebookPermalink,
  sleepFn,
} = {}) {
  if (!['text', 'reel', 'story'].includes(kind)) throw new Error('kind must be text, reel, or story');
  if (config.publishBackend !== 'postiz') throw new Error('PUBLISH_BACKEND must be postiz');
  const available = integrations || await client.integrations();
  const selected = available.filter((item) => config.postizChannelIds.includes(String(item.id)));
  if (selected.length === 0) throw new Error('No selected Postiz channels are connected');
  const videoUrl = digestVideoUrl(digest);
  if (kind !== 'text' && !videoUrl) throw new Error(`No digest video for ${kind}`);

  let mediaUpload = null;
  if (kind !== 'text') {
    const buffer = kind === 'story'
      ? await trimStory(videoUrl)
      : (await loadVideoBuffer(videoUrl)).buffer;
    mediaUpload = await client.upload(buffer, `${digest.id}-${kind}.mp4`);
    if (!uploadUrl(mediaUpload)) throw new Error('Postiz upload did not return a media URL');
  }

  const posts = selected.map((integration) => ({
    integration: { id: String(integration.id) },
    value: [mediaValue(captionFor(digest, kind, config), mediaUpload)],
    settings: providerSettings(integration.platform || integration.identifier, kind),
  }));
  const response = await client.createPost(posts);
  const created = collectPosts(response);
  const results = selected.map((integration, index) => {
    const result = created[index] || created[0] || response;
    return {
      integrationId: String(integration.id),
      postId: postIdOf(result),
      releaseURL: releaseUrlOf(result),
      platform: normalizePlatform(integration.platform || integration.identifier || integration.providerIdentifier),
    };
  });
  for (const item of results) {
    if (!item.releaseURL) {
      item.releaseURL = await waitForPostizReleaseUrl(client, item.postId, { sleepFn });
    }
  }
  if (kind === 'text' && typeof resolveFacebookPermalink === 'function') {
    for (const item of results) {
      if (item.platform === 'facebook' && !item.releaseURL) {
        item.releaseURL = (await resolveFacebookPermalink(digest.content)) || '';
      }
    }
  }
  return { kind, posts: results, response };
}

export function postizPostsForDigest(digest) {
  if (!digest?.postiz_posts) return {};
  if (typeof digest.postiz_posts === 'object') return digest.postiz_posts;
  try { return JSON.parse(digest.postiz_posts) || {}; } catch { return {}; }
}

export function firstFacebookRelease(results = []) {
  const facebook = results.find((item) => item.platform === 'facebook') || results[0];
  return isHttpUrl(facebook?.releaseURL) ? facebook.releaseURL : null;
}

export { apiBase };
