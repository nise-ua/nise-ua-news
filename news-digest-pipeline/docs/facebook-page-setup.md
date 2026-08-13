# Facebook Page API — Quick Setup Guide

> Quick reference for Facebook **Page** publishing.
> Digest **text** uses the Page composer (Patchright). Graph API remains for Reels, Stories, token refresh, and post-id lookup.
> Full research history is in `facebook-setup.md`.

---

## 1. Create a Meta App

1. Go to [developers.facebook.com](https://developers.facebook.com/) → **Create App**.
2. Use case: **Content management** → "Manage everything on your Page".
3. Provide app name and email.

**IMPORTANT regarding Business Portfolio:**
- If you link the app to a Business Portfolio during creation, the Graph API Explorer will **only show pages from that portfolio**.
- If you need personal pages (not in a portfolio) — choose **"I don't want to connect a business portfolio yet"**.
- This can be changed later, but it's easier to choose correctly from the start.

---

## 2. Get a Page Access Token

### Method A: Graph API Explorer (Simple)

1. Go to **Tools → Graph API Explorer**.
2. Select your app.
3. Click **"Get Token"** → **"Get Page Access Token"**.
4. Grant permissions: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`.
5. Select the desired page.
6. The Explorer will display the Page Access Token.

### Method B: Direct OAuth URL (If Page is not visible in Explorer)

Sometimes the Graph API Explorer doesn't show the desired page (especially if it's not in a Business Portfolio). In this case, use direct OAuth:

```
https://www.facebook.com/v23.0/dialog/oauth?client_id=APP_ID&redirect_uri=https://localhost/&scope=pages_manage_posts,pages_read_engagement,pages_show_list&response_type=token
```

Replace `APP_ID` with your App ID. After authorization, you will be redirected to `https://localhost/#access_token=...` — copy the User Token from the URL.

### Getting a Page Token from a User Token

User Token != Page Token. You must exchange it:

```bash
curl "https://graph.facebook.com/v23.0/me/accounts?access_token=USER_TOKEN"
```

The response contains a list of pages with an `access_token` and `id` for each:

```json
{
  "data": [
    {
      "access_token": "PAGE_ACCESS_TOKEN_HERE",
      "id": "YOUR_FACEBOOK_PAGE_ID",
      "name": "Your Page Name"
    }
  ]
}
```

---

## 3. Publication

Do **not** publish digest text via Graph `/feed`. That path is silently hidden from followers.

```bash
node scripts/fb-page-publish.js --login
node scripts/fb-page-publish.js latest
```

Dashboard **📘 FB** uses the same composer publisher. Reels still use Graph.

---

## 4. Token Expiration

| Type | Lifespan |
|-----|-----------|
| Short-lived token | ~1-2 hours |
| Long-lived token | ~60 days |

### Exchange short-lived → long-lived

```bash
curl "https://graph.facebook.com/v23.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id=APP_ID&\
client_secret=APP_SECRET&\
fb_exchange_token=SHORT_LIVED_TOKEN"
```

**IMPORTANT:** A long-lived token lasts ~60 days. It must be updated before expiration, or publication will stop working.

### Automatic Token Refresh (Built-in)

The project includes an automatic token refresh utility. To use it:

1. Add your Facebook App credentials to `.env`:
   ```env
   FACEBOOK_APP_ID=your-app-id
   FACEBOOK_APP_SECRET=your-app-secret
   ```

2. Run the refresh script:
   ```bash
   cd news-digest-pipeline
   node src/services/publishers/facebook-token-refresh.js
   ```

3. Copy the new token from the output into your `.env`:
   ```env
   FACEBOOK_PAGE_ACCESS_TOKEN=the-new-token-from-script
   ```

4. Restart the application.

You can also refresh programmatically:
```javascript
import { refreshSpecificPageToken } from './src/services/publishers/facebook-token-refresh.js';
const newToken = await refreshSpecificPageToken(appId, appSecret, currentToken, pageId);
```

---

## 5. Environment Variables

In your `.env` file (or on the VPS):

```env
FACEBOOK_PAGE_ID=YOUR_FACEBOOK_PAGE_ID
FACEBOOK_PAGE_NAME=Nise-ua
FACEBOOK_PAGE_ACCESS_TOKEN=EAAxxxxxx...
```

- `FACEBOOK_PAGE_ID` — The ID of the page (not the profile!).
- `FACEBOOK_PAGE_NAME` — Used to click the Page in the Facebook account switcher.
- `FACEBOOK_PAGE_ACCESS_TOKEN` — Page token for Reels and to resolve the composer post id. Not used to create text posts.

---

## 6. Verification

### Verify the token is valid and belongs to the page

```bash
curl "https://graph.facebook.com/v23.0/me?fields=id,name&access_token=TOKEN"
```

This should return the **page** name (e.g., "Your Page Name"), not the user's name.

### Verify access to the page feed

```bash
curl "https://graph.facebook.com/v23.0/PAGE_ID/feed?access_token=TOKEN"
```

This should return a list of recent posts on the page.
