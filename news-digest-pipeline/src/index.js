import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from './config.js';
import { initDb, resetStuckProcessingArticles } from './db/index.js';
import { apiAuth, dashboardAuth } from './middleware/auth.js';
import healthRouter from './routes/health.js';
import articlesRouter from './routes/articles.js';
import digestsRouter from './routes/digests.js';
import telegramRouter from './routes/telegram.js';
import settingsRouter from './routes/settings.js';
import postizRouter from './routes/postiz.js';
import { startQueueManager } from './services/queue-manager.js';
import { setupTelegramBot } from './services/telegram-bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Debug logging — only in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (req.path !== '/health') {
      console.log(`[debug] ${req.method} ${req.path} Content-Type: ${req.headers['content-type']}`);
    }
    next();
  });
}

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests' },
  // Video progress is polled while a render is running. It must not consume
  // the same request budget as user/API operations.
  skip: (req) => req.method === 'GET' && req.path.startsWith('/digests/video-jobs/'),
});

const publishLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many publish requests' },
});

const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Too many generation requests' },
});

const videoGenerateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Too many video generation requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health endpoint — public, no auth
app.use('/health', healthRouter);

// Dashboard (Basic Auth + rate limit for brute force protection)
const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 failed attempts per 15 min
  message: 'Too many login attempts, try again later',
  skipSuccessfulRequests: true, // only count 401s
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/health') return next();
  dashboardLimiter(req, res, () => {
    dashboardAuth(req, res, () => {
      express.static(join(__dirname, 'public'))(req, res, next);
    });
  });
});
app.use('/videos', express.static(join(__dirname, '..', 'production', 'video', 'output')));
app.use('/reels', express.static(join(__dirname, '..', 'production', 'video', 'output')));

// Telegram webhook — mounted before general API auth (has its own secret-token check)
app.use('/api/telegram', telegramRouter);

// API auth + rate limiting for all other /api/* routes
app.use('/api', apiAuth, apiLimiter);

// API routes with specific rate limits
app.use('/api/settings', settingsRouter);
app.use('/api/postiz/digests/:id/publish', publishLimiter);
app.use('/api/postiz', postizRouter);
app.use('/api/articles', articlesRouter);
app.use('/api/digests/generate', generateLimiter);
app.use('/api/digests/:id/publish', publishLimiter);
app.use('/api/digests/:id/generate-video', videoGenerateLimiter);
app.use('/api/digests', digestsRouter);

// Initialize
try {
  initDb(config.dbPath);
  console.log(`[init] Database initialized at ${config.dbPath}`);

  // Reset stuck articles from a previous crash/kill. On startup no digest
  // generation can be in flight, so it's safe to reset ALL 'processing' articles
  // back to 'new'. Without this, articles stuck mid-generation (e.g. a killed
  // process during Phase B) would remain stuck forever.
  const reset = resetStuckProcessingArticles(0);
  if (reset.updated > 0) {
    console.log(`[init] Reset ${reset.updated} stuck article(s) from 'processing' to 'new'`);
  }
} catch (err) {
  console.error('[init] Failed to initialize database:', err);
  process.exit(1);
}

// Start queue manager
const queueInterval = startQueueManager(config);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[shutdown] Stopping...');
  clearInterval(queueInterval);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[shutdown] Stopping...');
  clearInterval(queueInterval);
  process.exit(0);
});

// Start server
app.listen(config.port, () => {
  console.log(`[server] News Digest Pipeline running on port ${config.port}`);
  console.log(`[server] Environment: ${config.nodeEnv}`);

  // Register Telegram webhook after server is listening
  setupTelegramBot(config).catch((err) => {
    console.error('[init] Failed to setup Telegram bot:', err.message);
  });
});
