import { Router } from 'express';
import config from '../config.js';
import { getDigest, updateDigest } from '../db/index.js';
import {
  createPostizClient,
  aggregatePostizAnalytics,
  firstFacebookRelease,
  mergePostizPosts,
  normalizeAnalytics,
  postizPostsForDigest,
  publishPostizDigest,
} from '../services/publishers/postiz.js';
import { resolveLatestMatchingFeedPost } from '../services/publishers/facebook-page-match.js';
import { verifyPublishedFacebookPost } from '../services/publishers/facebook-visibility.js';

const router = Router();
const statsCache = new Map();
const CACHE_MS = 5 * 60 * 1000;

function maskedKey(key) {
  if (!key) return { configured: false, hint: '' };
  return { configured: true, hint: `…${String(key).slice(-4)}` };
}

async function getClient() {
  return createPostizClient({
    apiUrl: config.postizApiUrl,
    apiKey: config.postizApiKey,
  });
}

router.get('/status', async (req, res) => {
  const result = {
    backend: config.publishBackend,
    enabled: config.publishBackend === 'postiz',
    apiUrl: config.postizApiUrl,
    apiKey: maskedKey(config.postizApiKey),
    selectedChannelIds: config.postizChannelIds,
    integrations: [],
  };
  if (config.postizApiUrl && config.postizApiKey) {
    try {
      result.integrations = await (await getClient()).integrations();
    } catch (err) {
      result.error = err.message;
    }
  }
  res.json(result);
});

router.post('/digests/:id/publish', async (req, res) => {
  try {
    const digest = getDigest(req.params.id);
    if (!digest) return res.status(404).json({ error: 'Digest not found' });
    if (!digest.content) return res.status(400).json({ error: 'Digest has no content to publish' });
    if (config.publishBackend !== 'postiz' || !config.postizApiKey || !config.postizApiUrl) {
      return res.status(400).json({ error: 'Postiz backend, URL, and API key are required' });
    }
    const kind = req.body?.kind;
    const result = await publishPostizDigest(digest, config, kind, {
      resolveFacebookPermalink: async (content) => {
        if (!config.facebookPageAccessToken || !config.facebookPageId) return '';
        const resolved = await resolveLatestMatchingFeedPost(
          config.facebookPageAccessToken,
          config.facebookPageId,
          content,
        );
        return resolved?.permalinkUrl || '';
      },
    });
    const update = {
      status: 'published',
      published_at: new Date().toISOString(),
      postiz_posts: JSON.stringify(mergePostizPosts(digest, kind, result.posts)),
    };
    const release = firstFacebookRelease(result.posts);
    if (release && kind === 'text') update.facebook_post_id = release;
    if (release && kind === 'reel') update.facebook_reel_id = release;
    if (release && kind === 'story') update.facebook_story_id = release;
    updateDigest(digest.id, update);
    let visibility = null;
    const graphId = release && !/^https?:\/\//i.test(release);
    if (kind === 'text' && config.facebookPageAccessToken && graphId) {
      visibility = await verifyPublishedFacebookPost(
        config.facebookPageAccessToken,
        config.facebookPageId,
        release,
      );
    }
    res.json({
      digestId: digest.id,
      kind,
      published: result.posts,
      facebook_post_id: kind === 'text' ? release : undefined,
      visibility,
    });
  } catch (err) {
    console.error('[postiz] publish error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/digests/:id/stats', async (req, res) => {
  try {
    const digest = getDigest(req.params.id);
    if (!digest) return res.status(404).json({ error: 'Digest not found' });
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const entries = Object.entries(postizPostsForDigest(digest)).flatMap(([kind, posts]) =>
      (Array.isArray(posts) ? posts : []).map((post) => ({ ...post, kind })),
    ).filter((post) => post.postId);
    const now = Date.now();
    const channels = [];
    for (const post of entries) {
      const key = `${post.postId}:${days}`;
      let metrics = statsCache.get(key);
      if (!metrics || now - metrics.cachedAt > CACHE_MS) {
        if (post.releaseURL === 'missing') {
          metrics = { unavailable: true, metrics: [] };
        } else {
          metrics = { unavailable: false, metrics: normalizeAnalytics(await (await getClient()).postAnalytics(post.postId, days)) };
        }
        statsCache.set(key, { ...metrics, cachedAt: now });
      }
      channels.push({ integrationId: post.integrationId, kind: post.kind, postId: post.postId, releaseURL: post.releaseURL, ...metrics });
    }
    const series = aggregatePostizAnalytics(channels, ['text', 'story']);
    res.json({ digestId: digest.id, days, series, channels });
  } catch (err) {
    console.error('[postiz] stats error:', err);
    res.status(502).json({ error: err.message });
  }
});

export default router;
