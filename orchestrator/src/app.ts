import express, { NextFunction, Request, Response } from 'express';
import { Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';

import { CleanupService } from './cleanup-service';
import { FileDeploymentTracker } from './deployment-tracker';
import { DockerManager } from './docker-manager';
import { GitHubClient } from './github-client';
import { NginxManager } from './nginx-manager';
import { getOpenApiSpec } from './openapi';
import { IWebhookPayload } from './types/preview-config';
import { WebhookHandler } from './webhook-handler';

export interface AppOptions {
  allowedRepos: string[];
  deploymentsDir: string;
  deploymentsDb: string;
  nginxConfigDir: string;
  templatesDir: string;
  webhookSecret: string;
  githubToken: string;
  ttlDays: number;
  logger: Logger;
  /** Optional test double; when provided, used instead of creating GitHubClient. */
  githubClient?: GitHubClient;
  /** Optional test double; when provided, used instead of creating DockerManager. */
  dockerManager?: DockerManager;
  /** Optional no-op reload for tests (skip sudo nginx). */
  nginxReloadCommand?: () => Promise<void>;
  /** Optional base URL for OpenAPI spec servers (e.g. PREVIEW_BASE_URL or ORCHESTRATOR_PUBLIC_URL). */
  openApiBaseUrl?: string;
}

export interface CreateAppResult {
  app: express.Application;
  stopScheduledCleanup: () => void;
}

/**
 * Creates the Express app with all routes and services. Does not validate env or call listen.
 * Used by index.ts for production and by E2E tests with test doubles.
 */
export function createApp(options: AppOptions): CreateAppResult {
  const {
    allowedRepos,
    deploymentsDir,
    deploymentsDb,
    nginxConfigDir,
    templatesDir,
    webhookSecret,
    githubToken,
    ttlDays,
    logger,
    githubClient: providedGitHubClient,
    dockerManager: providedDockerManager,
    nginxReloadCommand,
    openApiBaseUrl,
  } = options;

  const tracker = new FileDeploymentTracker(deploymentsDb, logger);
  const githubClient = providedGitHubClient ?? new GitHubClient(githubToken, logger);
  const dockerManager =
    providedDockerManager ?? new DockerManager(deploymentsDir, templatesDir, tracker, logger);
  const nginxManager = new NginxManager(nginxConfigDir, logger, {
    reloadCommand: nginxReloadCommand ?? null,
  });
  const webhookHandler = new WebhookHandler(
    webhookSecret,
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

  cleanupService.startScheduledCleanup(6);

  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info({ method: req.method, path: req.path }, 'Incoming request');
    next();
  });

  const openApiSpec = getOpenApiSpec(openApiBaseUrl);
  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.post('/webhook/github', async (req: Request, res: Response) => {
    const signature = req.headers['x-hub-signature-256'] as string;
    const payload = JSON.stringify(req.body);

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

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  return {
    app,
    stopScheduledCleanup: () => cleanupService.stopScheduledCleanup(),
  };
}
