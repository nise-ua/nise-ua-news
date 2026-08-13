import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import {
  updateArticleStatus,
  updateArticleCommentary,
  createDigest,
  updateDigest,
  assignArticlesToDigest,
  getDigests,
  getDigest,
  getDb,
} from '../db/index.js';
import { priceFor } from '../data/model-catalog.js';
import { DEFAULT_OPENING_HASHTAG, normalizeDigestFormat } from './digest-format.js';

const MAX_CONTENT_LENGTH = 3000;
const RETRY_ATTEMPTS = 3;
const INTER_CALL_DELAY_MS = 200;
// Per-call timeout so a hung LLM request cannot leave articles stuck in
// 'processing' forever. Each SDK call gets its own AbortSignal timeout.
const MODEL_CALL_TIMEOUT_MS = 120000; // 2 minutes

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a single model call (already vendor-specific) with exponential-backoff
 * retry on 429. `fn` returns the raw vendor response.
 */
async function withRetry(fn, attempt = 1) {
  try {
    return await fn();
  } catch (err) {
    if (err?.status === 429 && attempt < RETRY_ATTEMPTS) {
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`[digest-generator] Rate limited, retrying in ${delay}ms (attempt ${attempt}/${RETRY_ATTEMPTS})`);
      await sleep(delay);
      return withRetry(fn, attempt + 1);
    }
    throw err;
  }
}

/**
 * Vendor-agnostic single-shot model call. Routes to Anthropic, OpenAI or
 * OpenRouter based on config.llmVendor. Returns text plus token usage.
 *
 * @param {Object} config App config (llmVendor, claudeModel, *BaseUrl, *ApiKey)
 * @param {{system:string, user:string, maxTokens:number}} opts
 * @returns {Promise<{text:string, inputTokens:number, outputTokens:number}>}
 */
async function callModel(config, { system, user, maxTokens }, phaseName = 'model') {
  const vendor = config.llmVendor || 'anthropic';
  const callStart = Date.now();
  console.log(`[digest-generator] ${phaseName}: LLM call started at ${new Date().toISOString()} (vendor=${vendor}, model=${config.claudeModel})`);

  // OpenAI-compatible callers: OpenAI (native), OpenRouter (OpenAI-compatible
  // API with DeepSeek & other routed models), and Moonshot (Kimi). The `openai`
  // SDK is used for all three.
  if (vendor === 'openai' || vendor === 'openrouter' || vendor === 'moonshot') {
    const apiKey = vendor === 'openrouter'
      ? config.openrouterApiKey
      : vendor === 'moonshot'
      ? config.moonshotApiKey
      : config.openaiApiKey;
    const baseUrl = vendor === 'openrouter'
      ? (config.openrouterBaseUrl || 'https://openrouter.ai/api/v1')
      : vendor === 'moonshot'
      ? (config.moonshotBaseUrl || 'https://api.moonshot.ai/v1')
      : config.openaiBaseUrl;

    if (!apiKey) {
      const keyName = vendor === 'openrouter' ? 'OPENROUTER_API_KEY' : vendor === 'moonshot' ? 'MOONSHOT_API_KEY' : 'OPENAI_API_KEY';
      const vendorLabel = vendor === 'openrouter' ? 'OpenRouter' : vendor === 'moonshot' ? 'Moonshot' : 'OpenAI';
      throw new Error(`${vendorLabel} API key не налаштовано (.env: ${keyName})`);
    }
    // Lazy import so the package is never loaded for the anthropic path and a
    // missing install does not break startup.
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl || undefined,
    });
    const vendorLabel = vendor === 'openrouter' ? 'OpenRouter' : vendor === 'moonshot' ? 'Moonshot' : 'OpenAI';
    console.log(`[callModel] Calling ${vendorLabel} with model: ${config.claudeModel}`);
    let resp;
    try {
      const completionParams = {
        model: config.claudeModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      };
      // Moonshot API uses max_tokens (legacy), not max_completion_tokens
      if (vendor === 'moonshot') {
        completionParams.max_tokens = maxTokens;
      } else {
        completionParams.max_completion_tokens = maxTokens;
      }
      resp = await withRetry(() => client.chat.completions.create(
        completionParams,
        { signal: AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS) }
      ));
    } catch (err) {
      console.error(`[digest-generator] ${phaseName}: LLM call FAILED after ${Date.now() - callStart}ms: ${err.message}`);
      throw err;
    }
    console.log(`[digest-generator] ${phaseName}: LLM call OK in ${Date.now() - callStart}ms`);
    return {
      text: (resp.choices[0]?.message?.content || resp.choices[0]?.message?.reasoning_content || '') || "",
      inputTokens: resp.usage?.prompt_tokens || 0,
      outputTokens: resp.usage?.completion_tokens || 0,
    };
  }

  // Default: Anthropic
  const client = new Anthropic({
    apiKey: config.anthropicApiKey,
    baseURL: config.anthropicBaseUrl || undefined,
  });
  let resp;
  try {
    resp = await withRetry(() => client.messages.create({
      model: config.claudeModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }, { signal: AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS) }));
  } catch (err) {
    console.error(`[digest-generator] ${phaseName}: LLM call FAILED after ${Date.now() - callStart}ms: ${err.message}`);
    throw err;
  }
  console.log(`[digest-generator] ${phaseName}: LLM call OK in ${Date.now() - callStart}ms`);
  return {
    text: resp.content[0]?.text || '',
    inputTokens: resp.usage?.input_tokens || 0,
    outputTokens: resp.usage?.output_tokens || 0,
  };
}

export async function generateDigest(db, articles, config) {
  const log = [];
  const genStart = Date.now();
  console.log(`[digest-generator] generateDigest START: ${articles.length} article(s) at ${new Date().toISOString()}`);

  // Token accounting across every successful model call (Phase A + Phase B).
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  log.push(`Starting digest generation for ${articles.length} articles`);

  // Select Phase A system prompt by active scenario. Assembly (Phase B) is
  // scenario-independent and always uses config.assemblyPrompt.
  const scenario = config.activeScenario || 'sarcastic';
  let commentarySystem = scenario === 'architect' ? config.deepPrompt : config.commentaryPrompt;
  if (scenario === 'architect' && (!config.deepPrompt || !config.deepPrompt.trim())) {
    commentarySystem = config.commentaryPrompt;
    log.push('Scenario: architect requested but deepPrompt is empty — falling back to commentaryPrompt');
  } else {
    log.push(`Scenario: ${scenario}`);
  }

  // Phase A: Generate commentary for each article
  for (const article of articles) {
    if (article.commentary) {
      log.push(`Skipping article ${article.id} — commentary already exists`);
      continue;
    }

    try {
      updateArticleStatus(article.id, 'processing');

      const contentTruncated = (article.content || '').slice(0, MAX_CONTENT_LENGTH);

      const userMessage = article.title
        ? `${article.title}\n\n${contentTruncated}`
        : contentTruncated;

      const res = await callModel(config, {
        system: commentarySystem,
        user: userMessage,
        maxTokens: 512,
      }, `commentary[${article.id}]`);
      const commentary = res.text;
      if (!commentary || !commentary.trim()) {
        throw new Error(`LLM returned empty commentary for article ${article.id}`);
      }
      totalInputTokens += res.inputTokens;
      totalOutputTokens += res.outputTokens;
      updateArticleCommentary(article.id, commentary);
      article.commentary = commentary;

      log.push(`Generated commentary for article ${article.id}: ${commentary.slice(0, 60)}...`);

      await sleep(INTER_CALL_DELAY_MS);
    } catch (err) {
      console.error(`[digest-generator] Error for article ${article.id}:`, err);
      log.push(`Error generating commentary for article ${article.id}: ${err.message}`);
      updateArticleStatus(article.id, 'error');
      // Store error message in fetch_error for visibility in UI
      const db = getDb();
      db.prepare(`UPDATE articles SET fetch_error = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(err.message, article.id);
      // Continue with other articles
    }
  }

  // Filter articles that have commentary
  const articlesWithCommentary = articles.filter((a) => a.commentary);

  if (articlesWithCommentary.length === 0) {
    console.error('[digest-generator] Generation failed for all articles. Logs:', log.join('\n'));
    throw new Error('No articles with commentary — cannot assemble digest');
  }

  // Phase B: Assembly
  const today = new Date().toISOString().slice(0, 10);

  // Build the user message for assembly
  const commentaryList = articlesWithCommentary
    .map((a, i) => `${i + 1}. ${a.commentary}\n${a.url}`)
    .join('\n\n');

  const assemblyUserMessageParts = [
    `Ось ${articlesWithCommentary.length} коментарів для складання дайджесту:`,
    '',
    commentaryList,
    '',
    '---',
  ];

  const openingHashtag = config.hashtag || DEFAULT_OPENING_HASHTAG;
  assemblyUserMessageParts.push(`Головний хештег (окремий перший рядок): ${openingHashtag}`);
  assemblyUserMessageParts.push('Перший блок починається з наступного рядка з "1." Не став хештег і 1. в один рядок.');
  assemblyUserMessageParts.push('');

  if (config.boundaryIntent) {
    assemblyUserMessageParts.push(`Кордон / дисклеймер (у кінці, дослівно): ${config.boundaryIntent}`);
    assemblyUserMessageParts.push('');
  }
  assemblyUserMessageParts.push('Не додавай хештеги в кінці поста і не копіюй ці інструкції у дайджест.');

  const assemblyUserMessage = assemblyUserMessageParts.join('\n');

  log.push('Assembling digest...');
  console.log(`[digest-generator] Phase A complete: ${articlesWithCommentary.length} commentary(ies); Phase B (assembly) START`);

  let assemblyRes;
  try {
    assemblyRes = await callModel(config, {
      system: config.assemblyPrompt,
      user: assemblyUserMessage,
      maxTokens: 16384,
    }, 'assembly');
  } catch (err) {
    // Phase B (assembly) failed AFTER Phase A marked the articles as
    // 'processing'. Roll them back to 'new' so the next run retries them
    // instead of leaving them stuck in 'processing' forever.
    const rollbackStmt = db.prepare(
      `UPDATE articles SET status = 'new', updated_at = datetime('now') WHERE id = ? AND status = 'processing'`
    );
    for (const a of articlesWithCommentary) {
      rollbackStmt.run(a.id);
    }
    log.push(`Digest assembly failed — reset ${articlesWithCommentary.length} article(s) back to 'new': ${err.message}`);
    throw err;
  }
  let digestContent = assemblyRes.text;
  totalInputTokens += assemblyRes.inputTokens;
  totalOutputTokens += assemblyRes.outputTokens;

  // Drop LLM preamble / leaked hashtag instructions, force `#новини` + `1.` opening,
  // and never append auto-generated trailing tags.
  const beforeNormalize = digestContent;
  digestContent = normalizeDigestFormat(digestContent, openingHashtag);
  if (config.boundaryIntent && !digestContent.includes(config.boundaryIntent)) {
    digestContent = `${digestContent}\n\n${config.boundaryIntent}`;
  }
  if (digestContent !== beforeNormalize) {
    log.push('Normalized digest opening/footer');
  }

  const activeHashtag = openingHashtag;

  // Create digest record
  const digestId = createDigest({
    date: today,
    part: 1,
    articlesCount: articlesWithCommentary.length,
  });

  // Compute cost from accumulated token usage and the model's base pricing.
  const p = priceFor(config.claudeModel);
  let costUsd = null;
  if (p) {
    const raw = (totalInputTokens / 1e6) * p.input + (totalOutputTokens / 1e6) * p.output;
    costUsd = Math.round(raw * 1e6) / 1e6;
  }

  const costLabel = costUsd === null ? 'n/a' : `$${costUsd}`;
  log.push(`Tokens: in=${totalInputTokens} out=${totalOutputTokens} | Model: ${config.claudeModel} | Cost: ${costLabel}`);

  updateDigest(digestId, {
    content: digestContent,
    status: 'draft',
    generation_log: log.join('\n'),
    model: config.claudeModel,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    cost_usd: costUsd,
  });

  // Assign articles to digest
  const articleIds = articlesWithCommentary.map((a) => a.id);
  assignArticlesToDigest(articleIds, digestId);
  console.log(`[digest-generator] Digest ${digestId} created & articles assigned in ${Date.now() - genStart}ms`);

  // Save digest as .txt file
  const filePath = saveDigestToFile(today, digestContent);
  log.push(`Digest saved to file: ${filePath}`);
  log.push(`Digest created: ${digestId}`);

  // Clean up source Telegram messages ONLY after confirming the digest was
  // assembled successfully: digest row exists, content is non-empty, and the
  // configured hashtag marker is present (if any). If anything looks off, skip 
  // cleanup so the source messages remain available for retry.
  const saved = getDigest(digestId);
  const digestOk = saved && typeof saved.content === 'string'
    && saved.content.length > 100
    && (!activeHashtag || saved.content.includes(activeHashtag));

  if (!digestOk) {
    log.push('Skipping source cleanup: digest not confirmed valid');
  } else if (config.telegramBotToken) {
    const { deleteTelegramMessage } = await import('./telegram-bot.js');
    const seen = new Set();
    let deleted = 0;
    let failed = 0;
    for (const a of articlesWithCommentary) {
      if (!a.source_chat_id || !a.source_message_id) continue;
      const key = `${a.source_chat_id}:${a.source_message_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const ok = await deleteTelegramMessage(config.telegramBotToken, a.source_chat_id, Number(a.source_message_id));
        if (ok) deleted++; else failed++;
      } catch {
        failed++;
      }
    }
    log.push(`Telegram source cleanup: deleted=${deleted}, failed=${failed}`);
  }

  return digestId;
}

function saveDigestToFile(date, content) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outputDir = join(__dirname, '../../output');
  mkdirSync(outputDir, { recursive: true });

  // Determine part number based on existing files for this date
  const existing = getDigests().filter((d) => d.date === date);
  const part = existing.length || 1;

  const filename = `digest_${date}_part${part}.txt`;
  const filePath = join(outputDir, filename);
  writeFileSync(filePath, content, 'utf-8');
  console.log(`[digest-generator] Saved digest to ${filePath}`);
  return filePath;
}