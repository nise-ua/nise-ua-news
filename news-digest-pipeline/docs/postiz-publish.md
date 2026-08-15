# Postiz publishing

V3 adds an isolated Postiz path while the existing dashboard publishers remain
unchanged. Keep `PUBLISH_BACKEND=legacy` until the local Postiz connection and
channel allowlist have been verified.

Set these values in `.env`:

```dotenv
PUBLISH_BACKEND=postiz
POSTIZ_API_URL=http://localhost:4007
POSTIZ_API_KEY=...
POSTIZ_CHANNEL_IDS=integration-id-1,integration-id-2
```

Open **Settings → Публікація**, confirm the API key is configured, and select
only the connected integrations that should receive posts. On the **Postiz**
page, each digest row is a complete operator workflow:

1. Review the full Ukrainian digest text.
2. Edit and save it with the existing digest PATCH API.
3. Generate or regenerate the reel without leaving the page.
4. Watch the queued job progress and open the finished video link.
5. Publish Text, Reel, or Story to every selected channel.
6. Review the per-channel Postiz sparklines beside the digest.

Reel/Story controls remain disabled until a generated local MP4 exists. Missing
content, credentials, channels, or video produces a clear disabled state or
inline error. The legacy `index.html` workflow remains available as a fallback.
Story media is trimmed to 59 seconds when needed.

Facebook text visibility differs from the current Patchright composer path:
Postiz uses Graph publishing. The Postiz Facebook app must be Live, and
`FACEBOOK_PAGE_ACCESS_TOKEN` can be used for a separate visibility check when
needed. The application deliberately does not fall back to the browser
composer.

Analytics are fetched for seven days by default and cached briefly. A missing
Postiz release URL is reported as unavailable rather than rendered as a broken
chart.
