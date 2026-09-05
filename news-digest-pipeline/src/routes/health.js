import { Router } from 'express';
import { getArticleCount } from '../db/index.js';
import { appBuildDate, appVersion } from '../version.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const stats = {
      new: getArticleCount('new'),
      processing: getArticleCount('processing'),
      used: getArticleCount('used'),
    };

    res.json({
      status: 'ok',
      version: appVersion,
      buildDate: appBuildDate,
      articles: stats,
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
