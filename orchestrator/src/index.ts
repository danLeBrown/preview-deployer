import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';

import { createApp } from './app';

// Load environment variables
dotenv.config();

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        }
      : undefined,
});

// Validate required environment variables
const requiredEnvVars = [
  'GITHUB_TOKEN',
  'GITHUB_WEBHOOK_SECRET',
  'ALLOWED_REPOS',
  'PREVIEW_BASE_URL',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error({ envVar }, 'Missing required environment variable');
    process.exit(1);
  }
}

// Initialize config from env
const allowedRepos = process.env.ALLOWED_REPOS!.split(',').map((repo) => repo.trim());
const deploymentsDir = process.env.DEPLOYMENTS_DIR || '/opt/preview-deployments';
const nginxConfigDir = process.env.NGINX_CONFIG_DIR || '/etc/nginx/preview-configs';
const deploymentsDb = process.env.DEPLOYMENTS_DB || '/opt/preview-deployer/deployments.json';
const templatesDir = __dirname + '/../templates';
const ttlDays = parseInt(process.env.CLEANUP_TTL_DAYS || '7', 10);
const port = parseInt(process.env.ORCHESTRATOR_PORT || '3000', 10);

// Create directories if they don't exist
try {
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.mkdirSync(path.dirname(deploymentsDb), { recursive: true });
  fs.mkdirSync(path.join(__dirname, '../logs'), { recursive: true });
} catch (error: unknown) {
  if (error instanceof Error) {
    logger.error({ error: error.message }, 'Failed to create directories');
  } else {
    logger.error({ error: 'Unknown error' }, 'Failed to create directories');
  }
}

const { app, stopScheduledCleanup } = createApp({
  allowedRepos,
  deploymentsDir,
  deploymentsDb,
  nginxConfigDir,
  templatesDir,
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  githubToken: process.env.GITHUB_TOKEN!,
  ttlDays,
  logger,
});

const server = app.listen(port, () => {
  logger.info({ port }, 'Orchestrator server started');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  stopScheduledCleanup();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  stopScheduledCleanup();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
