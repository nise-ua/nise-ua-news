/**
 * Facebook token refresh utility.
 *
 * Facebook Page Access Tokens expire after ~60 days. This module provides
 * functions to exchange/extend tokens using the Facebook Graph API.
 *
 * Requires:
 *   - FACEBOOK_APP_ID     (from Meta App Settings → Basic)
 *   - FACEBOOK_APP_SECRET (from Meta App Settings → Basic)
 *   - FACEBOOK_PAGE_ACCESS_TOKEN (the current page token)
 *
 * Usage:
 *   node src/services/publishers/facebook-token-refresh.js
 *
 * Or programmatically:
 *   import { refreshPageToken } from './facebook-token-refresh.js';
 *   const newToken = await refreshPageToken(appId, appSecret, currentToken);
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load .env from the project root (news-digest-pipeline/), regardless of CWD
config({ path: join(__dirname, '../../../.env') });

/**
 * Get a long-lived page access token by exchanging the current token.
 * Returns the new page token string or null on failure.
 */
export async function refreshPageToken(appId, appSecret, currentToken) {
  if (!appId || !appSecret || !currentToken) {
    console.error('[fb-refresh] Missing appId, appSecret, or currentToken');
    return null;
  }

  try {
    // Step 1: Exchange current token for a long-lived USER token
    const exchangeUrl =
      `https://graph.facebook.com/v23.0/oauth/access_token?` +
      `grant_type=fb_exchange_token&` +
      `client_id=${encodeURIComponent(appId)}&` +
      `client_secret=${encodeURIComponent(appSecret)}&` +
      `fb_exchange_token=${encodeURIComponent(currentToken)}`;

    const exchangeRes = await fetch(exchangeUrl);
    const exchangeData = await exchangeRes.json();

    if (!exchangeRes.ok || exchangeData.error) {
      console.error('[fb-refresh] Token exchange failed:', exchangeData.error?.message || JSON.stringify(exchangeData));
      return null;
    }

    const longLivedUserToken = exchangeData.access_token;
    if (!longLivedUserToken) {
      console.error('[fb-refresh] No access_token in exchange response');
      return null;
    }

    // Step 2: Get the Page Access Token from the long-lived user token
    const accountsUrl =
      `https://graph.facebook.com/v23.0/me/accounts?` +
      `access_token=${encodeURIComponent(longLivedUserToken)}`;

    const accountsRes = await fetch(accountsUrl);
    const accountsData = await accountsRes.json();

    if (!accountsRes.ok || accountsData.error) {
      console.error('[fb-refresh] Accounts fetch failed:', accountsData.error?.message || JSON.stringify(accountsData));
      return null;
    }

    // Find the page token. If only one page, return it. If multiple, the user
    // should set FACEBOOK_PAGE_ID so we can pick the right one.
    const pages = accountsData.data || [];
    if (pages.length === 0) {
      console.error('[fb-refresh] No pages found for this user token');
      return null;
    }

    // If there's only one page, return its token
    if (pages.length === 1) {
      return pages[0].access_token;
    }

    // Multiple pages — caller should specify which one they want.
    console.error('[fb-refresh] Multiple pages found. Please provide FACEBOOK_PAGE_ID to select the correct one.');
    console.error('[fb-refresh] Available pages:', pages.map(p => ({ id: p.id, name: p.name })));
    return null;
  } catch (err) {
    console.error('[fb-refresh] Unexpected error:', err.message);
    return null;
  }
}

/**
 * Get a long-lived page token for a specific page ID.
 */
export async function refreshSpecificPageToken(appId, appSecret, currentToken, pageId) {
  if (!appId || !appSecret || !currentToken || !pageId) {
    console.error('[fb-refresh] Missing appId, appSecret, currentToken, or pageId');
    return null;
  }

  try {
    // Step 1: Exchange current token for a long-lived USER token
    const exchangeUrl =
      `https://graph.facebook.com/v23.0/oauth/access_token?` +
      `grant_type=fb_exchange_token&` +
      `client_id=${encodeURIComponent(appId)}&` +
      `client_secret=${encodeURIComponent(appSecret)}&` +
      `fb_exchange_token=${encodeURIComponent(currentToken)}`;

    const exchangeRes = await fetch(exchangeUrl);
    const exchangeData = await exchangeRes.json();

    if (!exchangeRes.ok || exchangeData.error) {
      console.error('[fb-refresh] Token exchange failed:', exchangeData.error?.message || JSON.stringify(exchangeData));
      return null;
    }

    const longLivedUserToken = exchangeData.access_token;
    if (!longLivedUserToken) {
      console.error('[fb-refresh] No access_token in exchange response');
      return null;
    }

    // Step 2: Get the specific Page Access Token
    const accountsUrl =
      `https://graph.facebook.com/v23.0/me/accounts?` +
      `access_token=${encodeURIComponent(longLivedUserToken)}`;

    const accountsRes = await fetch(accountsUrl);
    const accountsData = await accountsRes.json();

    if (!accountsRes.ok || accountsData.error) {
      console.error('[fb-refresh] Accounts fetch failed:', accountsData.error?.message || JSON.stringify(accountsData));
      return null;
    }

    const pages = accountsData.data || [];
    const page = pages.find(p => String(p.id) === String(pageId));

    if (!page) {
      console.error(`[fb-refresh] Page ${pageId} not found in accounts`);
      return null;
    }

    return page.access_token;
  } catch (err) {
    console.error('[fb-refresh] Unexpected error:', err.message);
    return null;
  }
}

/**
 * Standalone CLI usage for manual token refresh.
 */
async function main() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const currentToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;

  if (!appId || !appSecret) {
    console.error('Please set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET environment variables.');
    console.error('You can find these in your Meta App Dashboard: https://developers.facebook.com/apps/');
    process.exit(1);
  }

  if (!currentToken) {
    console.error('Please set FACEBOOK_PAGE_ACCESS_TOKEN environment variable.');
    process.exit(1);
  }

  console.log('Refreshing Facebook Page Access Token...');
  const newToken = pageId
    ? await refreshSpecificPageToken(appId, appSecret, currentToken, pageId)
    : await refreshPageToken(appId, appSecret, currentToken);

  if (newToken) {
    console.log('\n✅ New token obtained successfully!');
    console.log('\nUpdate your .env file with:\n');
    console.log(`FACEBOOK_PAGE_ACCESS_TOKEN=${newToken}`);
    console.log('\nThen restart the application.');
  } else {
    console.error('\n❌ Failed to refresh token. See errors above.');
    process.exit(1);
  }
}

// Run if executed directly (ESM-compatible check)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}