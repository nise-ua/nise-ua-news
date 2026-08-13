/**
 * Facebook Page text publisher.
 * Uses the Page composer (Patchright) instead of Graph /feed.
 * Graph text posts from the Meta app are silently hidden from non-admins.
 */

import { verifyPublishedFacebookPost } from './facebook-visibility.js';
import { publishToFacebookPageViaBrowser } from './facebook-page-browser.js';
import { resolveLatestBrowserPost } from './facebook-page-match.js';

export async function publishToFacebook(pageAccessToken, pageId, content, extra = {}) {
  if (!pageId) {
    const errMsg = '[facebook] Missing pageId';
    console.error(errMsg);
    return { error: errMsg };
  }
  if (!content || String(content).trim().length < 10) {
    const errMsg = '[facebook] Missing content';
    console.error(errMsg);
    return { error: errMsg };
  }

  try {
    const browser = await publishToFacebookPageViaBrowser({
      pageId,
      pageName: extra.pageName || '',
      content,
      profileDir: extra.profileDir,
      timezoneId: extra.timezoneId,
    });
    if (browser?.error) return browser;

    if (!pageAccessToken) {
      return {
        error: '[facebook] Browser post ran, but FACEBOOK_PAGE_ACCESS_TOKEN is missing so the composer post id cannot be confirmed.',
        via: 'browser',
      };
    }

    const resolved = await resolveLatestBrowserPost(pageAccessToken, pageId, content);
    if (resolved?.error || !resolved?.postId) {
      return {
        error: resolved?.error || '[facebook] Browser post ran, but Graph could not find the composer post.',
        via: 'browser',
      };
    }

    if (resolved.application?.name || resolved.raw?.admin_creator?.name) {
      const appName = resolved.application?.name || resolved.raw?.admin_creator?.name;
      return {
        error: `[facebook] Resolved post is still tagged as app "${appName}". Composer did not post as the Page.`,
        via: 'browser',
      };
    }

    const visibility = await verifyPublishedFacebookPost(pageAccessToken, pageId, resolved.postId);
    return {
      postId: resolved.postId,
      permalinkUrl: resolved.permalinkUrl || null,
      via: 'browser',
      visibility,
    };
  } catch (err) {
    const errorMessage = `[facebook] ${err.message}`;
    console.error(errorMessage);
    return { error: errorMessage };
  }
}
