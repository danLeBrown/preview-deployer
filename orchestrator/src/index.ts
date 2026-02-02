import * as dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import pino from 'pino';

import { CleanupService } from './cleanup-service';
import { FileDeploymentTracker } from './deployment-tracker';
import { DockerManager } from './docker-manager';
import { GitHubClient } from './github-client';
import { NginxManager } from './nginx-manager';
import { IWebhookPayload } from './types/preview-config';
import { WebhookHandler } from './webhook-handler';

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

// Initialize services
const allowedRepos = process.env.ALLOWED_REPOS!.split(',').map((repo) => repo.trim());
const deploymentsDir = process.env.DEPLOYMENTS_DIR || '/opt/preview-deployments';
const nginxConfigDir = process.env.NGINX_CONFIG_DIR || '/etc/nginx/preview-configs';
const deploymentsDb = process.env.DEPLOYMENTS_DB || '/opt/preview-deployer/deployments.json';
const templatesDir = __dirname + '/../templates';
const ttlDays = parseInt(process.env.CLEANUP_TTL_DAYS || '7', 10);
const port = parseInt(process.env.ORCHESTRATOR_PORT || '3000', 10);

// Create directories if they don't exist
import * as fs from 'fs';
import * as path from 'path';

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

// Initialize core services
const tracker = new FileDeploymentTracker(deploymentsDb, logger);
const githubClient = new GitHubClient(process.env.GITHUB_TOKEN!, logger);
const dockerManager = new DockerManager(deploymentsDir, templatesDir, tracker, logger);
const nginxManager = new NginxManager(nginxConfigDir, logger);
const webhookHandler = new WebhookHandler(
  process.env.GITHUB_WEBHOOK_SECRET!,
  allowedRepos,
  githubClient,
  dockerManager,
  nginxManager,
  tracker,
  logger,
);
const cleanupService = new CleanupService(
  tracker,
  githubClient,
  dockerManager,
  nginxManager,
  ttlDays,
  logger,
);

// Start cleanup service
cleanupService.startScheduledCleanup(6);

// Initialize Express app
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info({ method: req.method, path: req.path }, 'Incoming request');
  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Webhook endpoint
app.post('/webhook/github', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const payload = JSON.stringify(req.body);

  // Verify signature
  if (!webhookHandler.verifySignature(payload, signature)) {
    logger.warn('Webhook signature verification failed');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  try {
    const webhookPayload = req.body as IWebhookPayload;
    await webhookHandler.handleWebhook(webhookPayload as IWebhookPayload);
    res.json({ status: 'ok' });
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error({ error: error.message }, 'Webhook handling failed');
    } else {
      logger.error({ error: 'Unknown error' }, 'Webhook handling failed');
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Admin endpoints
app.get('/api/previews', (_req: Request, res: Response) => {
  try {
    const deployments = tracker.getAllDeployments();
    res.json({ deployments });
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error({ error: error.message }, 'Failed to list deployments');
    } else {
      logger.error({ error: 'Unknown error' }, 'Failed to list deployments');
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.delete('/api/previews/:deploymentId', async (req: Request, res: Response) => {
  const deploymentId = req.params.deploymentId;
  if (!deploymentId) {
    res.status(400).json({ error: 'Invalid deployment id' });
    return;
  }

  try {
    const deployment = tracker.getDeployment(deploymentId);
    if (!deployment) {
      res.status(404).json({ error: 'Deployment not found' });
      return;
    }

    await dockerManager.cleanupPreview(deploymentId);
    await nginxManager.removePreview(deployment.projectSlug, deployment.prNumber);
    await tracker.deleteDeployment(deploymentId);

    res.json({ status: 'ok', message: `Preview ${deploymentId} cleaned up` });
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error({ deploymentId, error: error.message }, 'Failed to cleanup preview');
    } else {
      logger.error({ deploymentId, error: 'Unknown error' }, 'Failed to cleanup preview');
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
const server = app.listen(port, () => {
  logger.info({ port }, 'Orchestrator server started');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  cleanupService.stopScheduledCleanup();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  cleanupService.stopScheduledCleanup();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
