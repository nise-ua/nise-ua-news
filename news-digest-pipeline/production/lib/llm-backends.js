/**
 * Shared LLM dispatch helpers for storyboard, headlines, and audio script generation.
 * Supports: moonshot | openrouter | google | openai | anthropic.
 */

import { join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { projectRoot } from './logging.js';

const ROOT = projectRoot(import.meta.url, 2);
dotenvConfig({ path: join(ROOT, '.env'), override: false });

export function resolveLlmVendor(env = process.env) {
  const raw = String(env.LLM_VENDOR || '').trim().toLowerCase();
  if (raw) return raw;
  if (env.MOONSHOT_API_KEY) return 'moonshot';
  if (env.OPENROUTER_API_KEY) return 'openrouter';
  if (env.GOOGLE_API_KEY) return 'google';
  if (env.OPENAI_API_KEY) return 'openai';
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'openai';
}

export function resolveLlmModel(vendor, configuredModel, env = process.env) {
  if (configuredModel) return configuredModel;
  const v = String(vendor || '').trim().toLowerCase();
  if (v === 'moonshot') {
    return env.CLAUDE_MODEL || env.OPENAI_MODEL || 'kimi-k2.6';
  }
  if (v === 'openrouter') {
    return env.CLAUDE_MODEL || env.OPENAI_MODEL || 'deepseek/deepseek-chat';
  }
  if (v === 'google') {
    if (env.GOOGLE_MODEL && !env.GOOGLE_MODEL.includes('image')) {
      return env.GOOGLE_MODEL;
    }
    return env.CLAUDE_MODEL || 'gemini-2.5-flash';
  }
  if (v === 'anthropic') {
    return env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
  }
  return env.OPENAI_MODEL || env.CLAUDE_MODEL || 'gpt-4o';
}

export function parseJsonObject(text, label = 'AI response') {
  const jsonMatch = String(text || '').match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Failed to parse ${label} JSON`);
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(`Failed to parse ${label} JSON: ${err.message}`);
  }
}

/**
 * Low-level text completion across LLM vendors using fetch.
 */
export async function callLlmText({
  system = '',
  user = '',
  vendor,
  model,
  apiKey,
  baseUrl,
  maxTokens = 2048,
  fetchFn = globalThis.fetch,
  jsonMode = false,
  referer,
  title = 'NiSeNews LLM pipeline',
  env = process.env,
} = {}) {
  const resolvedVendor = (vendor || resolveLlmVendor(env)).trim().toLowerCase();
  const selectedModel = resolveLlmModel(resolvedVendor, model, env);

  if (resolvedVendor === 'moonshot') {
    const key = apiKey || env.MOONSHOT_API_KEY;
    if (!key) throw new Error('MOONSHOT_API_KEY missing in .env');
    const root = String(baseUrl || env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/$/, '');
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: user });

    const body = {
      model: selectedModel,
      messages,
      max_tokens: maxTokens,
    };
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
      // kimi-k2.6 thinks by default; reasoning tokens count against max_tokens
      // and can leave content empty (finish_reason=length) on JSON jobs.
      body.thinking = { type: 'disabled' };
    }

    const res = await fetchFn(`${root}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = payload?.error?.message || `Moonshot request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    const message = payload?.choices?.[0]?.message || {};
    const text = jsonMode
      ? message.content
      : (message.content || message.reasoning_content);
    if (!text) {
      const finish = payload?.choices?.[0]?.finish_reason || 'unknown';
      const reasoningTokens = payload?.usage?.completion_tokens_details?.reasoning_tokens;
      throw new Error(
        `Moonshot response did not contain text content (finish_reason=${finish}`
        + `${reasoningTokens != null ? `, reasoning_tokens=${reasoningTokens}` : ''})`,
      );
    }
    return text;
  }

  if (resolvedVendor === 'openrouter') {
    const key = apiKey || env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY missing in .env');
    const root = String(baseUrl || env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: user });

    const body = {
      model: selectedModel,
      messages,
      max_tokens: maxTokens,
    };
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetchFn(`${root}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(referer ? { 'HTTP-Referer': referer } : (env.BASE_URL ? { 'HTTP-Referer': env.BASE_URL } : {})),
        'X-Title': title,
      },
      body: JSON.stringify(body),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = payload?.error?.message || `OpenRouter request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    const text = payload?.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenRouter response did not contain text content');
    return text;
  }

  if (resolvedVendor === 'google') {
    const key = apiKey || env.GOOGLE_API_KEY;
    if (!key) throw new Error('GOOGLE_API_KEY missing in .env');
    const cleanModel = String(selectedModel).replace(/^google\//i, '');
    const promptText = system ? `${system}\n\n${user}` : user;

    const body = {
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: {
        ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    };

    const res = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = payload?.error?.message || `Google request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Google response did not contain text content');
    return text;
  }

  if (resolvedVendor === 'anthropic') {
    const key = apiKey || env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY missing in .env');
    const root = String(baseUrl || env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');

    const body = {
      model: selectedModel,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: user }],
    };
    if (system) {
      body.system = system;
    }

    const res = await fetchFn(`${root}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = payload?.error?.message || `Anthropic request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    const text = payload?.content?.[0]?.text;
    if (!text) throw new Error('Anthropic response did not contain text content');
    return text;
  }

  // Default: OpenAI
  const key = apiKey || env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing in .env');
  const root = String(baseUrl || env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user });

  const body = {
    model: selectedModel,
    messages,
    max_tokens: maxTokens,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetchFn(`${root}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error?.message || `OpenAI request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI response did not contain text content');
  return text;
}

/**
 * Execute LLM call and parse output as JSON object.
 */
export async function callLlmJson(options, label = 'AI response') {
  const text = await callLlmText({ ...options, jsonMode: true });
  return parseJsonObject(text, label);
}
