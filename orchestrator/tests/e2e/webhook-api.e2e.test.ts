import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { createApp } from '../../src/app';
import { DockerManager } from '../../src/docker-manager';
import { GitHubClient } from '../../src/github-client';
import type { TDatabaseType, TFramework } from '../../src/types/preview-config';

function signWebhookPayload(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return `sha256=${digest}`;
}

const mockLogger = {
  debug: () => void 0,
  error: () => void 0,
  info: () => void 0,
  warn: () => void 0,
  child: () => mockLogger,
};

describe('Webhook API E2E', () => {
  let deploymentsDir: string;
  let deploymentsDb: string;
  let nginxConfigDir: string;
  let stopScheduledCleanup: () => void;
  const webhookSecret = 'test-webhook-secret';
  const allowedRepos = ['test-org/test-repo'];

  beforeEach(async () => {
    const baseDir = path.join(
      os.tmpdir(),
      `preview-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    deploymentsDir = path.join(baseDir, 'deployments');
    deploymentsDb = path.join(baseDir, 'deployments.json');
    nginxConfigDir = path.join(baseDir, 'nginx-configs');
    await fs.mkdir(deploymentsDir, { recursive: true });
    await fs.mkdir(nginxConfigDir, { recursive: true });
    await fs.mkdir(path.dirname(deploymentsDb), { recursive: true });
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    stopScheduledCleanup?.();
  });

  it('should handle full API flow: health -> webhook -> list -> delete -> list empty', async () => {
    const mockGitHubClient = {
      postComment: jest.fn().mockResolvedValue(1),
      updateComment: jest.fn().mockResolvedValue(undefined),
      checkPRStatus: jest.fn().mockResolvedValue('open'),
    } as unknown as GitHubClient;

    const mockDockerManager = {
      deployPreview: jest.fn().mockResolvedValue({
        url: 'http://localhost/test-org-test-repo/pr-42/',
        appPort: 8000,
        dbPort: 9000,
        framework: 'nestjs' as TFramework,
        dbType: 'postgres' as TDatabaseType,
      }),
      cleanupPreview: jest.fn().mockResolvedValue(undefined),
      updatePreview: jest.fn().mockResolvedValue(undefined),
    } as unknown as DockerManager;

    const result = createApp({
      allowedRepos,
      deploymentsDir,
      deploymentsDb,
      nginxConfigDir,
      templatesDir: path.join(__dirname, '../../templates'),
      webhookSecret,
      githubToken: 'test-token',
      ttlDays: 7,
      logger: mockLogger as never,
      githubClient: mockGitHubClient,
      dockerManager: mockDockerManager,
      nginxReloadCommand: async () => void 0,
    });
    const { app } = result;
    stopScheduledCleanup = result.stopScheduledCleanup;

    // 1. GET /health -> 200
    const healthRes = await request(app).get('/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('ok');

    // 2. POST /webhook/github with valid signature -> 200
    const payloadPath = path.join(__dirname, '../fixtures/webhook-opened.json');
    const payloadJson = await fs.readFile(payloadPath, 'utf-8');
    const payload = JSON.parse(payloadJson) as object;
    const bodyString = JSON.stringify(payload);
    const signature = signWebhookPayload(bodyString, webhookSecret);
    const webhookRes = await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', signature)
      .send(payload);
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.status).toBe('ok');

    // 3. GET /api/previews -> deployment present
    const listRes = await request(app).get('/api/previews');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.deployments)).toBe(true);
    expect(listRes.body.deployments).toHaveLength(1);
    expect(listRes.body.deployments[0].deploymentId).toBe('test-org-test-repo-42');
    expect(listRes.body.deployments[0].prNumber).toBe(42);

    // 4. DELETE /api/previews/:deploymentId -> 200
    const deleteRes = await request(app).delete('/api/previews/test-org-test-repo-42');
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.status).toBe('ok');

    // 5. GET /api/previews -> empty
    const listAfterRes = await request(app).get('/api/previews');
    expect(listAfterRes.status).toBe(200);
    expect(listAfterRes.body.deployments).toHaveLength(0);
  });

  it('should serve OpenAPI spec at GET /openapi.json', async () => {
    const mockGitHubClient = {
      postComment: jest.fn(),
      updateComment: jest.fn(),
      checkPRStatus: jest.fn(),
    } as unknown as GitHubClient;
    const mockDockerManager = {
      deployPreview: jest.fn(),
      cleanupPreview: jest.fn(),
      updatePreview: jest.fn(),
    } as unknown as DockerManager;

    const result = createApp({
      allowedRepos,
      deploymentsDir,
      deploymentsDb,
      nginxConfigDir,
      templatesDir: path.join(__dirname, '../../templates'),
      webhookSecret,
      githubToken: 'test-token',
      ttlDays: 7,
      logger: mockLogger as never,
      githubClient: mockGitHubClient,
      dockerManager: mockDockerManager,
      nginxReloadCommand: async () => void 0,
    });
    const { app } = result;
    stopScheduledCleanup = result.stopScheduledCleanup;

    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info).toBeDefined();
    expect(res.body.info.title).toBe('Preview Deployer Orchestrator API');
    expect(res.body.paths).toBeDefined();
    expect(res.body.paths['/health']).toBeDefined();
    expect(res.body.paths['/webhook/github']).toBeDefined();
    expect(res.body.paths['/api/previews']).toBeDefined();
    expect(res.body.paths['/api/previews/{deploymentId}']).toBeDefined();
  });

  it('should reject webhook with invalid signature', async () => {
    const mockGitHubClient = {
      postComment: jest.fn(),
      updateComment: jest.fn(),
      checkPRStatus: jest.fn(),
    } as unknown as GitHubClient;
    const mockDockerManager = {
      deployPreview: jest.fn(),
      cleanupPreview: jest.fn(),
      updatePreview: jest.fn(),
    } as unknown as DockerManager;

    const result = createApp({
      allowedRepos,
      deploymentsDir,
      deploymentsDb,
      nginxConfigDir,
      templatesDir: path.join(__dirname, '../../templates'),
      webhookSecret,
      githubToken: 'test-token',
      ttlDays: 7,
      logger: mockLogger as never,
      githubClient: mockGitHubClient,
      dockerManager: mockDockerManager,
      nginxReloadCommand: async () => void 0,
    });
    const { app } = result;
    stopScheduledCleanup = result.stopScheduledCleanup;

    const payloadPath = path.join(__dirname, '../fixtures/webhook-opened.json');
    const payload = JSON.parse(await fs.readFile(payloadPath, 'utf-8'));
    // Use same-length invalid hex so timingSafeEqual doesn't throw
    const res = await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', 'sha256=' + '0'.repeat(64))
      .send(payload);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid signature');
  });
});
