/**
 * Full E2E tests: real GitHub client, real Docker, real clone and deploy.
 * Skip unless E2E_FULL=1 or CI_FULL_E2E=1.
 * Requires: GITHUB_TOKEN, GITHUB_WEBHOOK_SECRET, ALLOWED_REPOS (test repo owner/name),
 * PREVIEW_BASE_URL, and a test repo with branch main and a minimal Dockerfile + health endpoint.
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { createApp } from '../../src/app';

function signWebhookPayload(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return `sha256=${digest}`;
}

const runFullE2E = process.env.E2E_FULL === '1' || process.env.CI_FULL_E2E === '1';
const describeFull = runFullE2E ? describe : describe.skip;

describeFull('Webhook Full E2E', () => {
  let deploymentsDir: string;
  let deploymentsDb: string;
  let nginxConfigDir: string;
  let stopScheduledCleanup: () => void;

  beforeAll(() => {
    const required = ['GITHUB_TOKEN', 'GITHUB_WEBHOOK_SECRET', 'ALLOWED_REPOS', 'PREVIEW_BASE_URL'];
    for (const v of required) {
      if (!process.env[v]) {
        throw new Error(`Full E2E requires ${v}`);
      }
    }
  });

  beforeEach(async () => {
    const baseDir = path.join(
      os.tmpdir(),
      `preview-full-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    deploymentsDir = path.join(baseDir, 'deployments');
    deploymentsDb = path.join(baseDir, 'deployments.json');
    nginxConfigDir = path.join(baseDir, 'nginx-configs');
    await fs.mkdir(deploymentsDir, { recursive: true });
    await fs.mkdir(nginxConfigDir, { recursive: true });
    await fs.mkdir(path.dirname(deploymentsDb), { recursive: true });
  });

  afterEach(() => {
    if (stopScheduledCleanup) {
      stopScheduledCleanup();
    }
  });

  it('should deploy via webhook and cleanup via DELETE', async () => {
    const allowedRepos = process.env.ALLOWED_REPOS!.split(',').map((r) => r.trim());
    const [owner, repoName] = allowedRepos[0].split('/');
    if (!owner || !repoName) {
      throw new Error('ALLOWED_REPOS must be owner/repo');
    }
    const cloneUrl = `https://github.com/${owner}/${repoName}.git`;
    const { execSync } = await import('child_process');
    const sha = execSync(`git ls-remote ${cloneUrl} refs/heads/main`, { encoding: 'utf-8' })
      .trim()
      .split(/\s/)[0];
    if (!sha) {
      throw new Error('Could not get main HEAD sha');
    }

    const pino = await import('pino');
    const logger = pino.default({ level: 'info' });

    const result = createApp({
      allowedRepos,
      deploymentsDir,
      deploymentsDb,
      nginxConfigDir,
      templatesDir: path.join(__dirname, '../../templates'),
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
      githubToken: process.env.GITHUB_TOKEN!,
      ttlDays: 7,
      logger,
      nginxReloadCommand: async () => {},
    });
    const { app } = result;
    stopScheduledCleanup = result.stopScheduledCleanup;

    const prNumber = 9999;
    const deploymentId = `${owner}-${repoName}-${prNumber}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
    const payload = {
      action: 'opened',
      pull_request: {
        number: prNumber,
        head: {
          ref: 'main',
          sha,
          repo: { clone_url: cloneUrl, name: repoName, owner: { login: owner } },
        },
        base: { ref: 'main' },
      },
      repository: { full_name: allowedRepos[0], name: repoName, owner: { login: owner } },
    };
    const bodyString = JSON.stringify(payload);
    const signature = signWebhookPayload(bodyString, process.env.GITHUB_WEBHOOK_SECRET!);

    const webhookRes = await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', signature)
      .send(payload);
    expect(webhookRes.status).toBe(200);

    const listRes = await request(app).get('/api/previews');
    expect(listRes.status).toBe(200);
    const deployments = listRes.body.deployments as Array<{ deploymentId: string }>;
    const deployed = deployments.find(
      (d: { deploymentId: string }) => d.deploymentId === deploymentId,
    );
    expect(deployed).toBeDefined();

    const deleteRes = await request(app).delete(`/api/previews/${deploymentId}`);
    expect(deleteRes.status).toBe(200);

    const listAfterRes = await request(app).get('/api/previews');
    const afterDeployments = listAfterRes.body.deployments as Array<{ deploymentId: string }>;
    expect(
      afterDeployments.find((d: { deploymentId: string }) => d.deploymentId === deploymentId),
    ).toBeUndefined();
  }, 300000);
});
