# Facebook Publishing: Full Setup Guide

This document describes the entire process of setting up digest publication on Facebook — from creating a Meta App to browser automation. Two independent channels: **Facebook Page** (Graph API) and **personal profile** (Patchright).

---

## 1. Facebook Graph API (Publication to Page)

### 1.1. Create a Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com/).
2. **Create App** → choose **Content management** as the type.
3. App description: "Manage everything on your Page".
4. Provide an app name and contact email.

#### Business Portfolio Note

Meta may suggest linking the app to a Business Portfolio:
- The app is linked to a specific Business Portfolio (e.g., BM#1).
- If the target Page is linked to a **different** Business Portfolio or none at all — it **will not be visible** in the Graph API Explorer when generating a token.

**Recommendation:** Ensure the app and the target Page are linked to the same Business Portfolio, or use the direct OAuth URL method.

### 1.2. Get a Page Access Token

#### Method 1: Graph API Explorer

1. Open [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Select your app in the top dropdown.
3. Add permissions:
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `pages_show_list`
4. Click **Generate Access Token**.
5. Authenticate via Facebook → select the pages you want to grant access to.
6. In the "Page or User Token" dropdown, select the desired page.

#### Method 2: Direct OAuth URL (Recommended)

Use a direct OAuth request in your browser:

```
https://www.facebook.com/v23.0/dialog/oauth?client_id=APP_ID&redirect_uri=https://localhost/&scope=pages_manage_posts,pages_read_engagement,pages_show_list&response_type=token
```

Replace `APP_ID` with your app's ID. After authorization, you will be redirected to a URL containing the `access_token` (this is a short-lived **User Access Token**).

Then, get the Page Token via API:

```bash
curl "https://graph.facebook.com/v23.0/me/accounts?access_token=USER_ACCESS_TOKEN"
```

Find your page in the response and take its `access_token` — this is the **Page Access Token**.

### 1.3. Exchange for a Long-Lived Token

To exchange for a 60-day token:

```bash
curl "https://graph.facebook.com/v23.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id=APP_ID&\
client_secret=APP_SECRET&\
fb_exchange_token=SHORT_LIVED_TOKEN"
```

**Note:** A Page Access Token obtained using a long-lived User Token becomes long-lived (indefinite until revoked) itself.

### 1.4. Publication via Graph API

```bash
curl -X POST "https://graph.facebook.com/v19.0/PAGE_ID/feed" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Post text...",
    "access_token": "PAGE_ACCESS_TOKEN"
  }'
```

### 1.5. Limitations

- Graph API only works for **Pages**, not personal profiles.
- Rate limits: ~200 posts/hour per page.

---

## 2. Facebook Personal Profile (Publication via Patchright)

### 2.1. Why Browser Automation?

Facebook closed the API for personal profile publication in 2018. Browser automation is the only way to automate this process.

### 2.2. Why Patchright?

[Patchright](https://github.com/nicecloudy/patchright) is a Playwright fork with patches to bypass automation detection:
- Patches `Runtime.enable` signals.
- Sets `navigator.webdriver` to `false`.
- Bypasses other bot detection signals.

### 2.3. Architecture: Persistent Context

The script uses `launchPersistentContext()` (separate Chromium instance) to maintain sessions:

```javascript
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1200, height: 800 },
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
});
```

**Advantages:**
- Session (cookies, login state) is saved in the `.fb-profile/` directory.
- No conflict with your primary Chrome instance.

### 2.4. Bot Detection Evasion

The script includes:
- Random delays and mouse movements.
- Realistic text insertion (`insertText` instead of instant value setting).
- Feed scrolling before posting.

### 2.5. Technical Challenges

- **Hashtag Dropdown**: Can block buttons; script uses `Escape` and force clicks.
- **Link Previews**: Script automatically removes generated link previews to keep the post clean.
- **Localization**: Handles multiple languages for UI elements via comma-separated selectors.

### 2.6. Usage

**Initial Login:**
```bash
node scripts/fb-publish.js --login
```
Log in manually in the opened browser. The session will be saved.

**Publish Latest Digest:**
```bash
node scripts/fb-publish.js latest
```

---

## 3. Environment Variables

In your `.env` file:

```env
# Facebook Page
FACEBOOK_PAGE_ID=123456789012345
FACEBOOK_PAGE_ACCESS_TOKEN=EAAG...
```

### Token Verification

```bash
curl "https://graph.facebook.com/debug_token?\
input_token=${FACEBOOK_PAGE_ACCESS_TOKEN}&\
access_token=${FACEBOOK_PAGE_ACCESS_TOKEN}"
```
`expires_at: 0` means the token is permanent.
