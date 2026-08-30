# YouTube Shorts setup

Upload path: generate a vertical Short (`--format shorts`), then publish with YouTube Data API v3 `videos.insert`. There is no separate Shorts endpoint. YouTube classifies a Short when the file is vertical/square and **≤ 3 minutes**.

Default privacy is **unlisted** (`YOUTUBE_PRIVACY_STATUS`) until the channel and first uploads are verified.

## Quota

`videos.insert` costs **1,600 units**. The default project quota is **10,000/day** (~6 uploads). Enough for a daily digest; request a quota increase if you publish more.

## One-time Google Cloud + OAuth

1. In Google Cloud Console, enable **YouTube Data API v3**.
2. Create an OAuth client (Desktop app). Add redirect URI `http://localhost:3000/oauth2callback`.
3. Put the client into `news-digest-pipeline/.env`:

```bash
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_CHANNEL_ID=
YOUTUBE_PRIVACY_STATUS=unlisted
```

4. Consent on the NiSeNews channel and write the refresh token:

```bash
cd news-digest-pipeline
node scripts/youtube-oauth.js
```

Add the printed value:

```bash
YOUTUBE_REFRESH_TOKEN=
```

5. Confirm Settings → YouTube shows **готово**. Generate Shorts from the dashboard, preview the local file, then **▶️ YouTube**.

Secrets stay in `.env` only. Privacy can be changed from Settings (`unlisted` / `public` / `private`).
