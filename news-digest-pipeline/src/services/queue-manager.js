import { getArticleCount, getNewArticles, resetStuckProcessingArticles } from '../db/index.js';
import { generateDigest } from './digest-generator.js';
import { notifyDigestReady } from './notifier.js';
import { getDb } from '../db/index.js';

let running = false;

// Stale-processing sweep: if a digest generation run crashes or hangs without
// cleaning up, articles can be left in 'processing' forever. Periodically reset
// articles that have been stuck longer than the threshold.
const STALE_PROCESSING_MINUTES = 30;

async function sweepStaleProcessing() {
  try {
    const res = resetStuckProcessingArticles(STALE_PROCESSING_MINUTES);
    if (res.updated > 0) {
      console.log(`[queue-manager] Recovery sweep: reset ${res.updated} stale 'processing' article(s) to 'new'`);
    }
  } catch (err) {
    console.error('[queue-manager] Recovery sweep failed:', err.message);
  }
}

async function processQueue(config) {
  if (running) {
    return;
  }

  running = true;

  try {
    // Run recovery sweep before each processing pass so articles stuck from a
    // previous crashed/hung run are picked up again.
    await sweepStaleProcessing();

    const newCount = getArticleCount('new');

    if (newCount < config.articleThreshold) {
      return;
    }

    const limit = Math.min(newCount, config.maxArticlesPerDigest);
    const articles = getNewArticles(limit);

    console.log(`[queue-manager] Processing ${articles.length} articles into digest`);

    const db = getDb();
    const digestId = await generateDigest(db, articles, config);

    console.log(`[queue-manager] Digest generated: ${digestId}`);

    if (config.ntfyTopic) {
      const { getDigest } = await import('../db/index.js');
      const digest = getDigest(digestId);
      await notifyDigestReady(config.ntfyTopic, digest);
    }
  } catch (err) {
    console.error('[queue-manager] Error processing queue:', err.message);
  } finally {
    running = false;
  }
}

export function startQueueManager(config) {
  console.log(`[queue-manager] Started (interval: ${config.checkIntervalMs}ms, threshold: ${config.articleThreshold})`);

  const intervalId = setInterval(() => processQueue(config), config.checkIntervalMs);

  // Run once immediately
  processQueue(config);

  return intervalId;
}
