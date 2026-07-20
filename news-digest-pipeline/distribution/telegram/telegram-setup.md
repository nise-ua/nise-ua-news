# Telegram Setup: Bot and Channel Publication

Documentation for setting up the Telegram bot and publishing digests to a channel for the News Digest Pipeline.

---

## 1. Telegram Bot

The bot is created via [@BotFather](https://t.me/BotFather).

The bot token is stored in the `TELEGRAM_BOT_TOKEN` environment variable.

The bot performs two functions:
- **Receiving URLs from the user** — via webhook, it accepts article links and saves them to the database.
- **Publishing digests to a channel** — it sends finished digests to a Telegram channel.

---

## 2. Webhook for Receiving URLs

### Webhook URL

```
https://YOUR_DOMAIN/api/telegram/webhook
```

The webhook is registered automatically when the server starts via the Telegram Bot API (`setWebhook`). The `BASE_URL` variable must be set for this.

### Protection

The webhook is protected by a secret token. Telegram passes it in the `X-Telegram-Bot-Api-Secret-Token` header. The server checks the header value against the `TELEGRAM_WEBHOOK_SECRET` variable. If they don't match, the request is rejected with a 403 code.

### Security: Filtering by Chat ID

The bot only accepts messages from the user with the specified `TELEGRAM_CHAT_ID` (personal chat: `YOUR_TELEGRAM_USER_ID`). Messages from other users or chats are rejected and logged.

### Message Processing

The bot extracts URLs from message text using a regular expression and saves each unique URL to the database as an article with the source `telegram`. Duplicates are detected and not saved again.

After saving, the bot responds with a message containing the number of saved/duplicate articles and the current count of new articles.

### Threshold Notification

When the number of new articles reaches the threshold (default 13, configurable via `ARTICLE_THRESHOLD`), the bot sends a notification that enough articles have accumulated to generate a digest.

### Bot Commands

| Command | Description |
|---------|----------|
| `/start`, `/help` | Bot help |
| `/status` | Article counts by status (new, pending, used, total) |
| `/generate` | Force digest generation from accumulated articles |

---

## 3. Channel Publication

### Channel

- Channel ID: `YOUR_TELEGRAM_CHANNEL_ID`

**Important:** The channel ID must include the `-100` prefix for supergroups/channels. Without this prefix, the Telegram API will return a "chat not found" error.

### Permissions Setup

The bot must be added as an **administrator** of the channel with **Post Messages** permission. Without this permission, the bot will not be able to send messages to the channel.

### Environment Variable

A separate variable `TELEGRAM_PUBLISH_CHAT_ID` is used for publication, pointing to the channel. This is **not the same** as `TELEGRAM_CHAT_ID` (personal chat for receiving URLs).

---

## 4. Splitting Long Messages

Telegram limits a single message to **4096 characters**. Digests often take 9000-15000 characters, so they must be split.

### Splitting Algorithm

1. If text <= 4096 characters — sent as one message.
2. Otherwise, find the last numbered item boundary within the limit (pattern `\n\n5. `, `\n\n12. `, etc.).
3. If no item boundary is found — split at the last double newline (`\n\n`).
4. Extreme case — hard split at 4096 characters.

### Sending Parts

- Parts are sent sequentially with a **1-second delay** between messages.
- `disable_web_page_preview: true` — link previews are disabled to avoid cluttering the channel feed.
- The function returns the ID of the first message and the total number of parts sent.

---

## 5. iOS Shortcut for Sending URLs

An iOS Shortcut integrated into the Share Sheet is used for quickly sending links from an iPhone.

### How it Works

1. User opens an article in a browser or app.
2. Clicks "Share" (Share Sheet).
3. Selects the Shortcut.
4. Shortcut sends the URL to the bot in Telegram.

### Shortcut Setup

- Input source: **Shortcut Input**.
- The Shortcut receives the URL from the Share Sheet and sends it to the chat with the bot.

---

## 6. Environment Variables

| Variable | Purpose | Example |
|------------|-----------|--------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11` |
| `TELEGRAM_CHAT_ID` | User's personal chat ID (for receiving URLs) | `YOUR_TELEGRAM_USER_ID` |
| `TELEGRAM_PUBLISH_CHAT_ID` | Channel ID (for publishing digests) | `YOUR_TELEGRAM_CHANNEL_ID` |
| `TELEGRAM_WEBHOOK_SECRET` | Secret token for webhook verification | any string |
| `BASE_URL` | Base server URL (for webhook registration) | `https://YOUR_DOMAIN` |

All variables are set in the `.env` file or in `docker-compose.yml`.

---

## 7. Troubleshooting

### "chat not found" when publishing to a channel

**Reason:** Channel ID specified without the `-100` prefix.

**Solution:** Telegram requires the `-100` prefix for supergroups and channels.

### Bot cannot send a message to the channel

**Reason:** Bot is not an administrator or lacks posting permissions.

**Solution:**
1. Open channel settings in Telegram.
2. Go to "Administrators".
3. Add the bot.
4. Enable "Post Messages" permission.

### Webhook not registering

**Reason:** `BASE_URL` or `TELEGRAM_BOT_TOKEN` not set.

**Solution:** Check that both variables are set. The webhook registers automatically at startup. Check logs for `[telegram-bot] Webhook set: <url>`.

### Bot not responding to messages

**Possible Reasons:**
- Webhook not registered (check server logs).
- Server not accessible via HTTPS (Telegram requires a valid SSL certificate).
- Invalid `TELEGRAM_WEBHOOK_SECRET`.

### Checking webhook status

You can request the current webhook status via the Telegram API:

```bash
curl https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo
```
