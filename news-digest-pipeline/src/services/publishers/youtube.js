/**
 * YouTube Community Posts publisher (placeholder).
 *
 * TODO: YouTube Data API v3 does not currently support creating Community Posts
 * programmatically. The Activities API is read-only for community posts.
 * When/if YouTube opens a Community Posts write API, implement it here.
 * Alternative: use Puppeteer/Playwright to automate the browser flow.
 */
export async function publishToYouTube(accessToken, channelId, content) {
  console.warn(
    '[youtube] Community Posts API is not available. ' +
    'YouTube publishing is a placeholder — no post was created.'
  );
  return null;
}
