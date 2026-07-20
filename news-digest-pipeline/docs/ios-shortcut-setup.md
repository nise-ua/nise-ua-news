# iOS Shortcut Setup — News Digest

## Purpose
The shortcut appears in the Share Sheet on your iPhone. When you click "Share" in Perplexity → choose "News Digest" → the article URL is automatically sent to the server.

## Endpoint
```
POST https://YOUR_DOMAIN/api/articles
Content-Type: application/json
Body: {"url": "https://..."}
```

## Step-by-Step Instructions (iOS 26)

### Step 1. Create a New Command
1. Open the **Shortcuts** app on your iPhone.
2. Tap **"+"** at the top of the screen to create a new shortcut.
3. Tap **"Add Action."**

### Step 2. Add "Get URL from Input"
1. Search for **"URL."**
2. Select **"Get URLs from Input."**
3. Leave the "Shortcut Input" as is.

### Step 3. Add "Get Contents of URL"
1. Tap **"+"** at the bottom to add a second action.
2. Search for **"Contents."**
3. Select **"Get Contents of URL."**
4. It will show a field with **"URL."**

### Step 4. Configure Server Address
1. Tap the **"URL"** placeholder in the second block.
2. Type: `https://YOUR_DOMAIN/api/articles`.
3. If prompted, tap **"Allow"** for the connection.

### Step 5. Configure HTTP Request
1. Tap the **arrow (˅)** or **"Show More"** in the second block.
2. Settings:
   - **Method:** Change "GET" to **"POST."**
   - **Headers:** Tap to expand, then tap **"+"**:
     - Key: `Content-Type`
     - Value: `application/json`
   - **Request Body:** Leave as "JSON." Tap **"+"** to add a new field:
     - Type: **"Text"**
     - Key: `url`
     - Value: Tap the field and select the **"URLs"** variable (result from the first block).

### Step 6. Add Notification (Optional)
1. Tap **"+"** to add a third action.
2. Search for **"Notification."**
3. Select **"Show Notification."**
4. Set the text to: `Article sent`.

### Step 7. Rename Shortcut
1. Tap the shortcut name at the top.
2. Select **"Rename."**
3. Type: `News Digest`.

### Step 8. Enable Share Sheet
**Note:** In iOS 26, this setting is located under shortcut properties.

1. Open shortcut settings.
2. Find and enable **"Show in Share Sheet"** (or "On Export Page").
3. Tap **"Done."**

## Verification
1. Open any article in **Perplexity** on iPhone.
2. Tap **"Share."**
3. Find and tap **"News Digest."**
4. You should see the "Article sent" notification.
5. Verify on server:
   ```
   curl https://YOUR_DOMAIN/api/articles/stats
   ```

## Troubleshooting

| Issue | Solution |
|----------|---------|
| Shortcut doesn't appear in Share Sheet | Check "Show in Share Sheet" toggle in settings. |
| "URL not specified" error | Ensure the URL field in the second block has the full address, not just the variable. |
| Network error | Check that the URL starts with https. |
| No response from server | Open `https://YOUR_DOMAIN/health` in a browser to check status. |

## Final Command Structure
1. **Get URLs from Shortcut Input**
2. **Get contents of [URL]** (POST, JSON with url field)
3. **Show Notification** "Article sent"

## Setup Date
2026-04-03 (iOS 26.4)
