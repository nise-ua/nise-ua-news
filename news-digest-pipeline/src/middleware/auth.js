/**
 * Authentication middleware for API and Dashboard.
 *
 * - API routes: Bearer token or query param ?key= (using API_SECRET_KEY)
 * - Dashboard: HTTP Basic Auth (using DASHBOARD_PASSWORD, separate from API key)
 * - Telegram webhook: exempted (has its own secret-token check)
 *
 * Two separate keys: compromising one doesn't compromise the other.
 */

import { createHash, timingSafeEqual } from 'crypto';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function pruneLoginAttempts(now = Date.now()) {
  for (const [ip, entry] of loginAttempts) {
    if (entry.resetAt <= now) loginAttempts.delete(ip);
  }
}

function isLoginBlocked(req) {
  if (authDisabled()) return false;
  pruneLoginAttempts();
  const entry = loginAttempts.get(getClientIp(req));
  return entry != null && entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedLogin(req) {
  if (authDisabled()) return;
  const ip = getClientIp(req);
  const now = Date.now();
  let entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  }
  entry.count += 1;
  loginAttempts.set(ip, entry);
}

function clearLoginAttempts(req) {
  loginAttempts.delete(getClientIp(req));
}

/** @internal test helper */
export function resetLoginAttemptsForTests() {
  loginAttempts.clear();
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Hash both to constant length to avoid length-based timing leak
    const hashA = createHash('sha256').update(a).digest();
    const hashB = createHash('sha256').update(b).digest();
    return timingSafeEqual(hashA, hashB);
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Auth is enforced only in production. Locally (NODE_ENV !== 'production')
 * the dashboard and API are open so the login prompt doesn't get in the way.
 * The deployed instance runs with NODE_ENV=production and stays protected.
 */
function authDisabled() {
  return process.env.NODE_ENV !== 'production';
}

export function apiAuth(req, res, next) {
  // Telegram webhook has its own auth via X-Telegram-Bot-Api-Secret-Token
  if (req.path.startsWith('/telegram/') || req.path.startsWith('/api/telegram/')) return next();

  if (authDisabled()) return next();

  const expectedKey = process.env.API_SECRET_KEY;
  const dashPass = process.env.DASHBOARD_PASSWORD || '';
  if (!expectedKey && !dashPass) return next(); // dev mode

  function tokenMatches(value) {
    const token = String(value || '').trim();
    if (!token) return false;
    if (expectedKey && safeCompare(token, expectedKey)) return true;
    if (dashPass && safeCompare(token, dashPass)) return true;
    return false;
  }

  // Check Bearer token (Chrome plugin). Accept API key or dashboard password.
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    if (tokenMatches(authHeader.slice(7))) return next();
  }

  // Check query param
  if (req.query.key && tokenMatches(req.query.key)) return next();

  // Check Basic Auth (dashboard passes Basic Auth to API on same origin)
  if (authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
      const colonIdx = decoded.indexOf(':');
      if (colonIdx !== -1) {
        const pass = decoded.slice(colonIdx + 1);
        if (tokenMatches(pass)) return next();
      }
    } catch {
      // malformed — fall through
    }
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

function sendInvalidCredentials(req, res) {
  recordFailedLogin(req);
  res.setHeader('WWW-Authenticate', 'Basic realm="News Digest Dashboard"');
  return res.status(401).send('Invalid credentials');
}

export function dashboardAuth(req, res, next) {
  if (authDisabled()) return next();

  const expectedPass = process.env.DASHBOARD_PASSWORD || process.env.API_SECRET_KEY;
  if (!expectedPass) return next(); // dev mode

  if (isLoginBlocked(req)) {
    return res.status(429).send('Too many login attempts, try again later');
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="News Digest Dashboard"');
    return res.status(401).send('Authentication required');
  }

  try {
    const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) {
      return sendInvalidCredentials(req, res);
    }
    const user = decoded.slice(0, colonIdx);
    const pass = decoded.slice(colonIdx + 1);
    const expectedUser = process.env.DASHBOARD_USER || 'admin';

    if (!safeCompare(user, expectedUser) || !safeCompare(pass, expectedPass)) {
      return sendInvalidCredentials(req, res);
    }
  } catch {
    return sendInvalidCredentials(req, res);
  }

  clearLoginAttempts(req);
  next();
}
