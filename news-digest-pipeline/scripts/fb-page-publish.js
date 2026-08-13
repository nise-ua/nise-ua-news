#!/usr/bin/env node

/**
 * Facebook Page composer publisher (Patchright).
 *
 * First time:
 *   node scripts/fb-page-publish.js --login
 * Log in as the Page admin, switch to Nise-ua, then close the window.
 *
 * Publish:
 *   node scripts/fb-page-publish.js latest
 *   node scripts/fb-page-publish.js <digest-id>
 *
 * Dashboard 📘 FB uses the same publisher via /api/digests/:id/publish.
 */

import { config as dotenvConfig } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dirname, '..', '.env') });

const { default: appConfig } = await import('../src/config.js');
const { initDb, getDigest, getDigests, updateDigest } = await import('../src/db/index.js');
const { publishToFacebookPageViaBrowser } = await import('../src/services/publishers/facebook-page-browser.js');
const { publishToFacebook } = await import('../src/services/publishers/facebook.js');

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function main() {
  const args = process.argv.slice(2);
  const pageId = appConfig.facebookPageId;
  const pageName = appConfig.facebookPageName;
  const profileDir = appConfig.facebookBrowserProfileDir;

  if (!pageId) {
    console.error('Set FACEBOOK_PAGE_ID in .env');
    process.exit(1);
  }

  if (args.includes('--login')) {
    log('Login mode — log in, then switch to the Page.');
    const result = await publishToFacebookPageViaBrowser({
      pageId,
      pageName,
      profileDir,
      loginOnly: true,
      timezoneId: appConfig.facebookBrowserTimezone,
    });
    if (result?.error) {
      console.error(result.error);
      process.exit(1);
    }
    log('Done. You can now publish from the dashboard or this script.');
    return;
  }

  const id = args[0];
  if (!id) {
    console.error('Usage:');
    console.error('  node scripts/fb-page-publish.js --login');
    console.error('  node scripts/fb-page-publish.js latest');
    console.error('  node scripts/fb-page-publish.js <digest-id>');
    process.exit(1);
  }

  initDb(appConfig.dbPath);
  const digest = id === 'latest'
    ? getDigests({ limit: 1 })[0]
    : getDigest(id);

  if (!digest) {
    console.error(id === 'latest' ? 'No digests found' : `Digest not found: ${id}`);
    process.exit(1);
  }
  if (!digest.content || digest.content.trim().length < 10) {
    console.error('Digest has no content');
    process.exit(1);
  }

  log(`Publishing digest ${digest.id} as Page ${pageName || pageId} (${digest.content.length} chars)...`);
  const result = await publishToFacebook(
    appConfig.facebookPageAccessToken,
    pageId,
    digest.content,
    {
      pageName,
      profileDir,
      timezoneId: appConfig.facebookBrowserTimezone,
    },
  );

  if (result?.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result?.postId) {
    updateDigest(digest.id, {
      facebook_post_id: result.postId,
      status: 'published',
      published_at: new Date().toISOString(),
    });
    log(`Published: ${result.postId}`);
    if (result.permalinkUrl) log(result.permalinkUrl);
  } else {
    console.error('Publish finished without a post id');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
