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
import {
  buildCursorDigestPrompt,
  isCursorLlmVendor,
  parseCursorDigestPayload,
  runCursorCloudAgent,
} from './cursor-cloud-agent.js';

const MAX_CONTENT_LENGTH = 3000;
const RETRY_ATTEMPTS = 8;
const INTER_CALL_DELAY_MS = 1000;
// Thinking models (Kimi K2.6, GPT-5) share this budget with hidden reasoning.
// 512 used to cut 2-paragraph Ukrainian commentaries mid-word.
export const COMMENTARY_MAX_TOKENS = 8192;
export const ASSEMBLY_MAX_TOKENS = 16384;
// Per-call timeout so a hung LLM request cannot leave articles stuck in
// 'processing' forever. Each SDK call gets its own AbortSignal timeout.
const MODEL_CALL_TIMEOUT_MS = 180000; // 3 minutes — per-article commentary
const ASSEMBLY_CALL_TIMEOUT_MS = 360000; // 6 minutes — full digest assembly
const ABORT_SLOT_RELEASE_MS = 3000;

// Some vendors (Kimi/Moonshot, some OpenAI orgs) allow only one in-flight
// completion per organization. Queue all digest LLM calls in-process.
let llmQueue = Promise.resolve();

function withLlmLock(fn) {
  const run = llmQueue.then(fn, fn);
  llmQueue = run.then(() => undefined, () => undefined);
  return run;
}

function isAbortError(err) {
  const name = err?.name || '';
  const msg = String(err?.message || '');
  return name === 'APIUserAbortError'
    || name === 'AbortError'
    || /aborted|timeout/i.test(msg);
}

function timeoutError(timeoutMs, err) {
  const wrapped = new Error(`LLM call timed out after ${timeoutMs}ms`);
  wrapped.cause = err;
  wrapped.status = err?.status;
  return wrapped;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(err, attempt) {
  const headers = err?.headers;
  const headerVal = headers && typeof headers.get === 'function'
    ? headers.get('retry-after')
    : headers?.['retry-after'] || headers?.['Retry-After'];
  const headerSec = headerVal != null ? Number(headerVal) : NaN;
  const msgMatch = String(err?.message || '').match(/after\s+(\d+)\s+seconds?/i);
  const msgSec = msgMatch ? Number(msgMatch[1]) : NaN;
  const vendorMs = Number.isFinite(headerSec)
    ? headerSec * 1000
    : Number.isFinite(msgSec)
      ? msgSec * 1000
      : 0;
  return Math.max(vendorMs, Math.pow(2, attempt) * 1000, 1000);
}

/**
 * Retry 429 only. Do not retry client aborts: the vendor still counts the
 * aborted request against org concurrency=1, so a second call 429s immediately.
 */
async function withRetry(fn, attempt = 1) {
  try {
    return await fn();
  } catch (err) {
    if (err?.status === 429 && attempt < RETRY_ATTEMPTS) {
      const delay = retryAfterMs(err, attempt);
      console.warn(`[digest-generator] Rate limited (concurrency), retrying in ${delay}ms (attempt ${attempt}/${RETRY_ATTEMPTS})`);
      await sleep(delay);
      return withRetry(fn, attempt + 1);
    }
    throw err;
  }
}

/** Models that accept Moonshot `thinking: { type: "disabled" }`. K2.7 Code rejects it. */
export function moonshotExtraBody(modelId, { disableThinking } = {}) {
  if (!disableThinking) return undefined;
  const id = String(modelId || '').toLowerCase();
  if (id === 'kimi-k2.6' || id === 'kimi-k2.5' || id.startsWith('kimi-k2.6')) {
    return { thinking: { type: 'disabled' } };
  }
  return undefined;
}

export function extractChatCompletionText(resp) {
  const message = resp?.choices?.[0]?.message;
  return (message?.content || message?.reasoning_content || '') || '';
}

export function completionWasTruncated(resp) {
  return resp?.choices?.[0]?.finish_reason === 'length'
    || resp?.stop_reason === 'max_tokens';
}

/**
 * Vendor-agnostic single-shot model call. Routes to Anthropic, OpenAI or
 * OpenRouter based on config.llmVendor. Returns text plus token usage.
 *
 * @param {Object} config App config (llmVendor, llmModel, *BaseUrl, *ApiKey)
 * @param {{system:string, user:string, maxTokens:number}} opts
 * @returns {Promise<{text:string, inputTokens:number, outputTokens:number}>}
 */
async function callModel(config, { system, user, maxTokens, timeoutMs, disableThinking }, phaseName = 'model') {
  const vendor = config.llmVendor || 'anthropic';
  if (isCursorLlmVendor(vendor)) {
    throw new Error('Cursor digest uses a single Cloud Agent run, not callModel');
  }
  const modelId = config.llmModel || config.claudeModel;
  const callTimeoutMs = timeoutMs || MODEL_CALL_TIMEOUT_MS;
  const callStart = Date.now();
  console.log(`[digest-generator] ${phaseName}: LLM call started at ${new Date().toISOString()} (vendor=${vendor}, model=${modelId}, timeout=${callTimeoutMs}ms)`);

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
    console.log(`[callModel] Calling ${vendorLabel} with model: ${modelId}`);
    let resp;
    try {
      const completionParams = {
        model: modelId,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      };
      // Moonshot API uses max_tokens (legacy), not max_completion_tokens
      if (vendor === 'moonshot') {
        completionParams.max_tokens = maxTokens;
        // openai-node has no extra_body (that's the Python SDK). Put Moonshot
        // fields on the JSON body so K2.6 actually disables thinking.
        const extra = moonshotExtraBody(modelId, { disableThinking });
        if (extra) Object.assign(completionParams, extra);
      } else {
        completionParams.max_completion_tokens = maxTokens;
      }
      resp = await withLlmLock(async () => {
        try {
          return await withRetry(() => client.chat.completions.create(
            completionParams,
            { signal: AbortSignal.timeout(callTimeoutMs) }
          ));
        } catch (err) {
          if (isAbortError(err)) await sleep(ABORT_SLOT_RELEASE_MS);
          throw err;
        }
      });
    } catch (err) {
      console.error(`[digest-generator] ${phaseName}: LLM call FAILED after ${Date.now() - callStart}ms: ${err.message}`);
      throw isAbortError(err) ? timeoutError(callTimeoutMs, err) : err;
    }
    console.log(`[digest-generator] ${phaseName}: LLM call OK in ${Date.now() - callStart}ms`);
    if (completionWasTruncated(resp)) {
      console.warn(`[digest-generator] ${phaseName}: completion truncated (finish_reason=length)`);
    }
    return {
      text: extractChatCompletionText(resp),
      truncated: completionWasTruncated(resp),
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
    resp = await withLlmLock(async () => {
      try {
        return await withRetry(() => client.messages.create({
          model: modelId,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }, { signal: AbortSignal.timeout(callTimeoutMs) }));
      } catch (err) {
        if (isAbortError(err)) await sleep(ABORT_SLOT_RELEASE_MS);
        throw err;
      }
    });
  } catch (err) {
    console.error(`[digest-generator] ${phaseName}: LLM call FAILED after ${Date.now() - callStart}ms: ${err.message}`);
    throw isAbortError(err) ? timeoutError(callTimeoutMs, err) : err;
  }
  console.log(`[digest-generator] ${phaseName}: LLM call OK in ${Date.now() - callStart}ms`);
  const truncated = completionWasTruncated(resp);
  if (truncated) {
    console.warn(`[digest-generator] ${phaseName}: completion truncated (stop_reason=max_tokens)`);
  }
  return {
    text: resp.content[0]?.text || '',
    truncated,
    inputTokens: resp.usage?.input_tokens || 0,
    outputTokens: resp.usage?.output_tokens || 0,
  };
}

export async function generateDigest(db, articles, config) {
  const log = [];
  const genStart = Date.now();
  console.log(`[digest-generator] generateDigest START: ${articles.length} article(s) at ${new Date().toISOString()}`);

  log.push(`Starting digest generation for ${articles.length} articles`);

  const scenario = config.activeScenario || 'sarcastic';
  let commentarySystem = scenario === 'architect' ? config.deepPrompt : config.commentaryPrompt;
  if (scenario === 'architect' && (!config.deepPrompt || !config.deepPrompt.trim())) {
    commentarySystem = config.commentaryPrompt;
    log.push('Scenario: architect requested but deepPrompt is empty — falling back to commentaryPrompt');
  } else {
    log.push(`Scenario: ${scenario}`);
  }

  if (isCursorLlmVendor(config.llmVendor)) {
    return generateDigestCursor(db, articles, config, {
      commentarySystem,
      log,
      genStart,
    });
  }

  // Token accounting across every successful model call (Phase A + Phase B).
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

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
        maxTokens: COMMENTARY_MAX_TOKENS,
        disableThinking: true,
      }, `commentary[${article.id}]`);
      const commentary = res.text;
      if (!commentary || !commentary.trim()) {
        throw new Error(`LLM returned empty commentary for article ${article.id}`);
      }
      if (res.truncated) {
        throw new Error(`LLM truncated commentary for article ${article.id} (token cap)`);
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
  assemblyUserMessageParts.push(`Головний хештег (перший рядок разом із першим абзацом): ${openingHashtag}`);
  assemblyUserMessageParts.push('Перший рядок: хештег, пробіл, потім "1." і перший абзац. Не став хештег на окремий рядок.');
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
      maxTokens: ASSEMBLY_MAX_TOKENS,
      timeoutMs: ASSEMBLY_CALL_TIMEOUT_MS,
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

  return finalizeAssembledDigest({
    db,
    articles: articlesWithCommentary,
    digestContent,
    config,
    log,
    genStart,
    totalInputTokens,
    totalOutputTokens,
  });
}

function rollbackProcessingArticles(db, articles) {
  const rollbackStmt = db.prepare(
    `UPDATE articles SET status = 'new', updated_at = datetime('now') WHERE id = ? AND status = 'processing'`
  );
  for (const a of articles) {
    rollbackStmt.run(a.id);
  }
}

async function generateDigestCursor(db, articles, config, { commentarySystem, log, genStart }) {
  log.push('Vendor: cursor (single-shot Cloud Agent)');
  const openingHashtag = config.hashtag || DEFAULT_OPENING_HASHTAG;
  const toGenerate = articles.filter((a) => !a.commentary);
  for (const article of toGenerate) {
    updateArticleStatus(article.id, 'processing');
  }

  try {
    const prompt = buildCursorDigestPrompt(articles, {
      commentarySystem,
      assemblyPrompt: config.assemblyPrompt,
      hashtag: openingHashtag,
      boundaryIntent: config.boundaryIntent,
    });
    const runAgent = config.cursorAgentRun || runCursorCloudAgent;
    const run = await runAgent({
      apiKey: config.cursorApiKey,
      modelId: config.llmModel || config.claudeModel,
      prompt,
      name: 'News digest',
    });
    log.push(`Cursor agent ${run.agentId} run ${run.runId}${run.durationMs ? ` (${run.durationMs}ms)` : ''}`);
    const payload = parseCursorDigestPayload(run.result, articles.map((a) => a.id));
    for (const article of articles) {
      const commentary = payload.commentariesById.get(String(article.id));
      updateArticleCommentary(article.id, commentary);
      article.commentary = commentary;
      log.push(`Stored commentary for article ${article.id}: ${commentary.slice(0, 60)}...`);
    }
    return finalizeAssembledDigest({
      db,
      articles,
      digestContent: payload.digest,
      config,
      log,
      genStart,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    });
  } catch (err) {
    rollbackProcessingArticles(db, toGenerate);
    log.push(`Cursor digest failed — reset ${toGenerate.length} article(s) back to 'new': ${err.message}`);
    console.error('[digest-generator] Cursor digest failed:', err);
    throw err;
  }
}

async function finalizeAssembledDigest({
  db,
  articles,
  digestContent,
  config,
  log,
  genStart,
  totalInputTokens,
  totalOutputTokens,
}) {
  const today = new Date().toISOString().slice(0, 10);
  const openingHashtag = config.hashtag || DEFAULT_OPENING_HASHTAG;
  const beforeNormalize = digestContent;
  digestContent = normalizeDigestFormat(digestContent, openingHashtag);
  if (config.boundaryIntent && !digestContent.includes(config.boundaryIntent)) {
    digestContent = `${digestContent}\n\n${config.boundaryIntent}`;
  }
  if (digestContent !== beforeNormalize) {
    log.push('Normalized digest opening/footer');
  }

  const digestId = createDigest({
    date: today,
    part: 1,
    articlesCount: articles.length,
  });

  const modelId = config.llmModel || config.claudeModel;
  const p = priceFor(modelId);
  let costUsd = null;
  if (p && (totalInputTokens || totalOutputTokens)) {
    const raw = (totalInputTokens / 1e6) * p.input + (totalOutputTokens / 1e6) * p.output;
    costUsd = Math.round(raw * 1e6) / 1e6;
  }

  const costLabel = costUsd === null ? 'n/a' : `$${costUsd}`;
  log.push(`Tokens: in=${totalInputTokens} out=${totalOutputTokens} | Model: ${modelId} | Cost: ${costLabel}`);

  updateDigest(digestId, {
    content: digestContent,
    status: 'draft',
    generation_log: log.join('\n'),
    model: modelId,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    cost_usd: costUsd,
  });

  assignArticlesToDigest(articles.map((a) => a.id), digestId);
  console.log(`[digest-generator] Digest ${digestId} created & articles assigned in ${Date.now() - genStart}ms`);

  const filePath = saveDigestToFile(today, digestContent);
  log.push(`Digest saved to file: ${filePath}`);
  log.push(`Digest created: ${digestId}`);

  const saved = getDigest(digestId);
  const digestOk = saved && typeof saved.content === 'string'
    && saved.content.length > 100
    && (!openingHashtag || saved.content.includes(openingHashtag));

  if (!digestOk) {
    log.push('Skipping source cleanup: digest not confirmed valid');
  } else if (config.telegramBotToken) {
    const { deleteTelegramMessage } = await import('./telegram-bot.js');
    const seen = new Set();
    let deleted = 0;
    let failed = 0;
    for (const a of articles) {
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

  if (digestOk) {
    try {
      const { startImageGeneration } = await import('./image-generator.js');
      const job = startImageGeneration(digestId);
      console.log(`[digest-generator] Auto cover started for ${digestId} (job ${job.id})`);
    } catch (err) {
      console.error(`[digest-generator] Auto cover start failed for ${digestId}:`, err.message);
    }
  }

  updateDigest(digestId, { generation_log: log.join('\n') });
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