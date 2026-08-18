import { config as dotenvConfig } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenvConfig();

const __dirname = dirname(fileURLToPath(import.meta.url));
const parentDir = join(__dirname, '..');  // news-digest-pipeline root
const newsRoot = join(parentDir, '..');   // News/ directory with prompt files

// Prompts are looked up in three places, in order:
//   1. /app/prompts        — Docker volume mount
//   2. <pipeline>/prompts  — bare-metal (systemd) deploy ships them here
//   3. News/ parent dir    — local dev
const dockerPromptsDir = '/app/prompts';
const localPromptsDir = join(parentDir, 'prompts');
const promptsDir = existsSync(join(dockerPromptsDir, 'prompt.md'))
  ? dockerPromptsDir
  : existsSync(join(localPromptsDir, 'prompt.md'))
  ? localPromptsDir
  : newsRoot;

// Absolute paths to all editable source files. Exported so the settings API
// can read/write the exact same files config.js loads from.
export const paths = {
  promptsDir,
  commentaryPrompt: join(promptsDir, 'prompt.md'),
  assemblyPrompt: join(promptsDir, 'assembly_prompt.md'),
  deepPrompt: join(promptsDir, 'prompt_deep.md'),
  configMd: join(promptsDir, 'config.md'),
  env: join(parentDir, '.env'),
};

function readFileOrWarn(filePath, label) {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.warn(`[config] Warning: could not read ${label} at ${filePath}`);
    return '';
  }
}

export const REEL_FRAME_MODES = ['ai', 'html'];
export const PUBLISH_BACKENDS = ['legacy', 'postiz'];

/** Normalize REEL_FRAME_MODE to 'ai' | 'html' (default ai). */
export function normalizeReelFrameMode(value) {
  const mode = String(value || 'ai').trim().toLowerCase();
  return REEL_FRAME_MODES.includes(mode) ? mode : 'ai';
}

export function normalizePublishBackend(value) {
  const backend = String(value || 'legacy').trim().toLowerCase();
  return PUBLISH_BACKENDS.includes(backend) ? backend : 'legacy';
}

export function parsePostizChannelIds(value) {
  if (Array.isArray(value)) return value.map(String).map((id) => id.trim()).filter(Boolean);
  return String(value || '').split(',').map((id) => id.trim()).filter(Boolean);
}

export function parseConfigMd(text) {
  const result = {
    hashtag: '',
    boundaryIntent: '',
    hashtagsSuffix: '',
  };

  if (!text) {
    result.hashtag = '#новини';
    return result;
  }

  // 1. Extract hashtags suffix using regex first (global search)
  const hashtagMarkerRegex = /додавати в кінці поста хе[шс]теги:/i;
  const hashtagMatch = text.match(new RegExp(`${hashtagMarkerRegex.source}\\s*\\n+([\\s\\S]*?)(?:\\n##|\\n\\n\\n|$)`, 'i'));

  if (hashtagMatch) {
    result.hashtagsSuffix = hashtagMatch[1].trim();
  }

  // 2. Split by headings and process sections
  const sections = text.split(/^## /m);

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const heading = lines[0]?.trim().toLowerCase() || '';
    let body = lines.slice(1).join('\n').trim();

    // Singular opening tag only — do not treat "Хештеги" / "Hashtags" as the lead tag.
    if (/^(хештег(?!и)|hashtag(?!s))\b/i.test(heading)) {
      result.hashtag = body.split('\n')[0].trim();
    } else if (
      heading.includes('кордон') ||
      heading.includes('відписка') ||
      heading.includes('дисклеймер') ||
      heading.includes('border') ||
      heading.includes('disclaimer') ||
      heading.includes('opt-out') ||
      heading.includes('opt out')
    ) {
      // Prevent greediness: if this section contains the hashtags marker, cut it off
      if (hashtagMarkerRegex.test(body)) {
        body = body.split(hashtagMarkerRegex)[0].trim();
      }
      result.boundaryIntent = body;
    }
  }

  if (!result.hashtag) result.hashtag = '#новини';
  return result;
}

/**
 * Build the full settings object from the current environment and source files.
 * Pure read — does not mutate anything.
 */
function buildConfig() {
  const commentaryPrompt = readFileOrWarn(paths.commentaryPrompt, 'prompt.md');
  const assemblyPrompt = readFileOrWarn(paths.assemblyPrompt, 'assembly_prompt.md');
  const deepPrompt = readFileOrWarn(paths.deepPrompt, 'prompt_deep.md');
  const configMdRaw = readFileOrWarn(paths.configMd, 'config.md');
  const parsedConfig = parseConfigMd(configMdRaw);

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    falKey: process.env.FAL_KEY || '',
    claudeModel: process.env.CLAUDE_MODEL || 'gpt-5.4-mini',

    // LLM vendor selection. claudeModel above is the active model id, shared by
    // both vendors (it just holds whatever model id the user picked).
    llmVendor: process.env.LLM_VENDOR || 'openai', // 'anthropic' | 'openai' | 'openrouter' | 'moonshot'
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '', // secret
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || '',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '', // secret
    moonshotBaseUrl: process.env.MOONSHOT_BASE_URL || '',
    moonshotApiKey: process.env.MOONSHOT_API_KEY || '', // secret
    geminiApiKey: process.env.GEMINI_API_KEY || '', // secret (planned integrations)
  // Use an absolute path for the SQLite DB to avoid cwd issues when the server is started from a subdirectory.
  dbPath: process.env.DB_PATH || join(__dirname, '..', 'data', 'news-digest.db'),
    ntfyTopic: process.env.NTFY_TOPIC || '',
    articleThreshold: parseInt(process.env.ARTICLE_THRESHOLD || '13', 10),
    maxArticlesPerDigest: parseInt(process.env.MAX_ARTICLES_PER_DIGEST || '17', 10),
    checkIntervalMs: parseInt(process.env.CHECK_INTERVAL_MS || '60000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    // Active commentary scenario for Phase A: 'sarcastic' (prompt.md) or
    // 'architect' (prompt_deep.md). Assembly (Phase B) is scenario-independent.
    activeScenario: process.env.ACTIVE_SCENARIO || 'sarcastic',

    // Publishers
    facebookPageId: process.env.FACEBOOK_PAGE_ID || '',
    facebookPageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
    facebookPageName: process.env.FACEBOOK_PAGE_NAME || '',
    facebookBrowserProfileDir: process.env.FACEBOOK_BROWSER_PROFILE_DIR
      || join(parentDir, '.fb-page-profile'),
    facebookBrowserTimezone: process.env.FACEBOOK_BROWSER_TIMEZONE || 'America/New_York',
    facebookAppId: process.env.FACEBOOK_APP_ID || '',
    facebookAppSecret: process.env.FACEBOOK_APP_SECRET || '',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    telegramPublishChatId: process.env.TELEGRAM_PUBLISH_CHAT_ID || '',
    youtubeClientId: process.env.YOUTUBE_CLIENT_ID || '',
    youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET || '', // secret
    youtubeRefreshToken: process.env.YOUTUBE_REFRESH_TOKEN || '', // secret
    youtubeChannelId: process.env.YOUTUBE_CHANNEL_ID || '',
    youtubePrivacyStatus: process.env.YOUTUBE_PRIVACY_STATUS || 'unlisted',

    // Reel frame pipeline: 'ai' = generate-reel.js (SVG overlay),
    // 'html' = generate-reel-html.js (HTML hybrid templates).
    reelFrameMode: normalizeReelFrameMode(process.env.REEL_FRAME_MODE),

    publishBackend: normalizePublishBackend(process.env.PUBLISH_BACKEND),
    postizApiUrl: process.env.POSTIZ_API_URL || 'http://localhost:4007',
    postizApiKey: process.env.POSTIZ_API_KEY || '',
    postizChannelIds: parsePostizChannelIds(process.env.POSTIZ_CHANNEL_IDS),

    // Planned integrations (placeholders for status display only — pipelines
    // are not implemented yet).
    instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
    instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
    tiktokAccessToken: process.env.TIKTOK_ACCESS_TOKEN || '',

    // Telegram webhook
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    baseUrl: process.env.BASE_URL || '',

    // Raw config.md text (kept for the settings editor)
    configMdRaw,

    // Prompts (loaded from parent directory files)
    commentaryPrompt,
    assemblyPrompt,
    deepPrompt,

    // Parsed config.md values
    hashtag: parsedConfig.hashtag,
    boundaryIntent: parsedConfig.boundaryIntent,
    hashtagsSuffix: parsedConfig.hashtagsSuffix,
  };
}

// Live config object. NOT frozen — importers hold this reference and read
// properties at call time, so reloadConfig() mutating it in place propagates.
const appConfig = buildConfig();

/**
 * Reload configuration in place: re-read .env (override existing process.env),
 * re-read the four source files, re-parse config.md, then reassign every
 * property on the SAME appConfig object so existing importers see new values.
 * Returns the same appConfig reference.
 */
export function reloadConfig() {
  dotenvConfig({ path: paths.env, override: true });
  const fresh = buildConfig();

  // Drop properties that no longer exist, then copy fresh values in place.
  for (const key of Object.keys(appConfig)) {
    if (!(key in fresh)) delete appConfig[key];
  }
  Object.assign(appConfig, fresh);

  return appConfig;
}

export default appConfig;
