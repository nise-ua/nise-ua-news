/**
 * Shared image-generation backend helpers for feed (4:5) and reel (9:16) pipelines.
 * Callers keep orchestration (loops, delays); this module owns vendor adapters.
 */

const DEFAULT_OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const PORTRAIT_NOTE = 'Portrait 9:16 composition, native vertical image.';

export function resolveImageModel(configuredModel) {
  let model = String(configuredModel || 'dall-e-3').trim();
  if (model.includes('/')) model = model.split('/').pop();
  return model === 'gpt-image-1-mini' ? 'gpt-image-1' : model;
}

/**
 * OpenAI Images API size for a model + aspect.
 * - 4:5 (feed): dall-e-3 → 1024x1792, gpt-image-1 → 1024x1536
 * - 9:16 (reel): dall-e-3 / gpt-image-1 → 1024x1792
 */
export function imageSizeForModel(model, aspect = '4:5') {
  if (model === 'dall-e-3') return '1024x1792';
  if (model === 'gpt-image-1') {
    return aspect === '9:16' ? '1024x1792' : '1024x1536';
  }
  return '1024x1024';
}

export function resolveImageVendor(env = process.env) {
  const raw = String(env.IMAGE_VENDOR || '').trim().toLowerCase();
  if (raw) return raw;
  return env.OPENAI_API_KEY ? 'dalle' : 'fal';
}

export function isHardImageQuotaError(status, message) {
  const text = String(message || '').toLowerCase();
  if (status === 402) return true;
  if (/spend(?:ing)? cap|insufficient credits|no credits remaining|resource_exhausted/.test(text)) {
    return true;
  }
  return status === 429 && /spend(?:ing)? cap|credits|billing|quota/.test(text);
}

export function isRetryableImageError(error) {
  const message = String(error?.message || error);
  if (isHardImageQuotaError(error?.status, message)) return false;
  const lower = message.toLowerCase();
  return error?.status === 429
    || /429|rate limit|too many requests|temporarily unavailable|try again later/.test(lower);
}

export function openRouterImageRequestBody(prompt, model, aspect = '4:5') {
  const isGptImage = Boolean(model?.includes('gpt-image-1'));
  const isReel = aspect === '9:16';
  const finalPrompt = isReel ? `${prompt}\n${PORTRAIT_NOTE}` : prompt;

  const body = {
    model,
    prompt: finalPrompt,
    n: 1,
    output_format: 'png',
  };

  if (isGptImage && !isReel) {
    body.aspect_ratio = '2:3';
    return body;
  }

  if (isGptImage && isReel) {
    body.aspect_ratio = '9:16';
    return body;
  }

  body.resolution = '2K';
  body.aspect_ratio = isReel ? '9:16' : '4:5';
  return body;
}

export function falImageSize(aspect = '4:5') {
  if (aspect === '9:16') return { width: 1080, height: 1920 };
  return { width: 1080, height: 1350 };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeLogUrl(url) {
  if (!url) return 'null';
  if (url.startsWith('data:')) {
    return `${url.slice(0, 40)}... [base64 data URI, length: ${url.length}]`;
  }
  return url.length > 80 ? `${url.slice(0, 80)}...` : url;
}

function defaultLog(msg) {
  console.log(msg);
}

/**
 * OpenRouter /images generation. Inject fetchFn / apiKey for tests.
 */
export async function generateOpenRouterImage(prompt, model, {
  aspect = '4:5',
  fetchFn = globalThis.fetch,
  apiKey = process.env.OPENROUTER_API_KEY,
  baseUrl = process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE,
  referer = process.env.BASE_URL,
  title = 'NiSeNews image pipeline',
} = {}) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing in .env');
  const root = String(baseUrl).replace(/\/$/, '');
  const body = openRouterImageRequestBody(prompt, model, aspect);

  const response = await fetchFn(`${root}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(referer ? { 'HTTP-Referer': referer } : {}),
      'X-Title': title,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `OpenRouter image request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const item = payload?.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:${item.media_type || 'image/png'};base64,${item.b64_json}`;
  throw new Error('OpenRouter response did not contain an image payload');
}

/**
 * Google Gemini / Imagen image generation (multi-model fallback from feed pipeline).
 * Optional openRouterFallback(prompt) for reel-style recovery.
 */
export async function generateGoogleImage(prompt, {
  apiKey = process.env.GOOGLE_API_KEY,
  model = process.env.GOOGLE_MODEL || 'gemini-2.5-flash-image',
  fetchFn = globalThis.fetch,
  genAI = null,
  openRouterFallback = null,
  openaiFallback = null,
  log = defaultLog,
} = {}) {
  if (!apiKey) throw new Error('GOOGLE_API_KEY missing in .env');

  const modelsToTry = [
    model,
    'gemini-2.5-flash-image',
    'gemini-2.0-flash-preview-image-generation',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError = null;
  let skipGoogleNetwork = false;

  for (const modelName of modelsToTry) {
    if (skipGoogleNetwork) break;
    try {
      const res = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part?.inlineData?.data) {
            const mime = part.inlineData.mimeType || 'image/png';
            return `data:${mime};base64,${part.inlineData.data}`;
          }
        }
        lastError = `Google ${modelName}: response OK but no image part`;
        log(`  ${lastError}`);
      } else {
        const errText = await res.text();
        lastError = `Google ${modelName} ${res.status}: ${errText.slice(0, 180)}`;
        log(`  ${lastError}`);
        if (isHardImageQuotaError(res.status, errText)) skipGoogleNetwork = true;
      }
    } catch (err) {
      lastError = `Google ${modelName} fetch error: ${err.message}`;
      log(`  ${lastError}`);
    }
  }

  const imagenModels = ['imagen-3.0-generate-002', 'imagen-3.0-fast-generate-001'];
  for (const modelName of imagenModels) {
    if (skipGoogleNetwork) break;
    try {
      const res = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: '9:16' },
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
        if (b64) return `data:image/png;base64,${b64}`;
        lastError = `Google Imagen ${modelName}: OK but no image bytes`;
      } else {
        const errText = await res.text();
        lastError = `Google Imagen ${modelName} ${res.status}: ${errText.slice(0, 120)}`;
        log(`  ${lastError}`);
        if (isHardImageQuotaError(res.status, errText)) skipGoogleNetwork = true;
      }
    } catch (err) {
      lastError = `Google Imagen ${modelName} error: ${err.message}`;
      log(`  ${lastError}`);
    }
  }

  if (genAI && !skipGoogleNetwork) {
    try {
      const sdkModel = genAI.getGenerativeModel({ model: modelsToTry[0] });
      const result = await sdkModel.generateContent(prompt);
      const candidates = result?.response?.candidates;
      if (candidates?.length) {
        const part = candidates[0].content?.parts?.[0];
        if (part?.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return `data:${mime};base64,${part.inlineData.data}`;
        }
        if (part?.blob?.data) {
          return `data:image/png;base64,${part.blob.data}`;
        }
      }
    } catch (err) {
      lastError = `Gemini SDK generateContent error: ${err.message}`;
      log(`  ${lastError}`);
    }
  }

  if (typeof openRouterFallback === 'function') {
    log('  Fallback: generating Google image via OpenRouter...');
    try {
      const url = await openRouterFallback(prompt);
      if (url) return url;
    } catch (err) {
      lastError = `OpenRouter fallback: ${err.message}`;
      log(`  ${lastError}`);
    }
  }

  if (typeof openaiFallback === 'function') {
    log('  Fallback: generating Google image via OpenAI...');
    try {
      const url = await openaiFallback(prompt);
      if (url) return url;
    } catch (err) {
      lastError = `OpenAI fallback: ${err.message}`;
      log(`  ${lastError}`);
    }
  }

  throw new Error(lastError || 'Failed to obtain image from Google Gemini/Imagen');
}

export async function generateOpenAIImage(prompt, {
  openai,
  model = process.env.DALLE_MODEL,
  aspect = '4:5',
  log = defaultLog,
} = {}) {
  if (!openai) throw new Error('OpenAI client is required');
  const resolved = resolveImageModel(model);
  const size = imageSizeForModel(resolved, aspect);
  log(`  Requesting OpenAI Image Gen (${resolved})....`);

  const response = await openai.images.generate({
    model: resolved,
    prompt,
    n: 1,
    size,
    quality: (resolved === 'dall-e-3' || resolved === 'gpt-image-3') ? 'standard' : undefined,
  });

  const item = response?.data?.[0];
  let imageUrl = null;
  if (item?.url) imageUrl = item.url;
  else if (item?.b64_json) imageUrl = `data:image/png;base64,${item.b64_json}`;
  if (!imageUrl) {
    throw new Error('Invalid response structure from OpenAI: missing url and b64_json');
  }
  log(`  OpenAI response: received data payload (${safeLogUrl(imageUrl)})`);
  return imageUrl;
}

export async function generateFalImage(prompt, {
  fal,
  aspect = '4:5',
} = {}) {
  if (!fal) throw new Error('fal client is required');
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY missing in .env');
  const result = await fal.subscribe('fal-ai/flux/dev', {
    input: {
      prompt,
      image_size: falImageSize(aspect),
      num_inference_steps: 28,
      guidance_scale: 3.5,
    },
  });
  return result.data.images[0].url;
}

/**
 * Dispatch image generation by vendor.
 * Supported: openrouter | dalle/openai | google | fal
 */
export async function generateImage(prompt, {
  vendor,
  aspect = '4:5',
  model,
  openai,
  fal,
  genAI,
  fetchFn = globalThis.fetch,
  apiKey,
  baseUrl,
  referer,
  title,
  openRouterFallback,
  openaiFallback,
  log = defaultLog,
} = {}) {
  const resolvedVendor = (vendor || resolveImageVendor()).trim().toLowerCase();

  if (resolvedVendor === 'openrouter') {
    return generateOpenRouterImage(prompt, model || process.env.DALLE_MODEL || 'qwen/qwen-image-3-pro', {
      aspect,
      fetchFn,
      apiKey: apiKey || process.env.OPENROUTER_API_KEY,
      baseUrl,
      referer,
      title,
    });
  }

  if (resolvedVendor === 'dalle' || resolvedVendor === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing in .env');
    return generateOpenAIImage(prompt, {
      openai,
      model: model || process.env.DALLE_MODEL,
      aspect,
      log,
    });
  }

  if (resolvedVendor === 'google') {
    return generateGoogleImage(prompt, {
      apiKey: apiKey || process.env.GOOGLE_API_KEY,
      model: model || process.env.GOOGLE_MODEL,
      fetchFn,
      genAI,
      openRouterFallback,
      openaiFallback,
      log,
    });
  }

  return generateFalImage(prompt, { fal, aspect });
}

/**
 * Retry wrapper for rate-limited image calls (used by reel OpenRouter path).
 */
export async function generateImageWithRetry(generateFn, {
  maxRetries = Math.max(0, Number(process.env.IMAGE_MAX_RETRIES || 3)),
  baseDelayMs = Math.max(250, Number(process.env.IMAGE_RETRY_DELAY_MS || 4000)),
  log = defaultLog,
  label = 'Image',
} = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await generateFn();
    } catch (error) {
      if (!isRetryableImageError(error) || attempt >= maxRetries) throw error;
      const delayMs = baseDelayMs * (2 ** attempt);
      log(`  ${label}: rate limited; retry ${attempt + 1}/${maxRetries} in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }
}
