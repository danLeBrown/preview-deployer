/**
 * DockerManager integration tests.
 * Requires: Docker daemon running.
 * Optional: Set DOCKER_TEST_REPO_URL to a minimal public repo (Dockerfile + health at /health) to run deploy/cleanup tests.
 * Example: DOCKER_TEST_REPO_URL=https://github.com/owner/minimal-preview-app.git
 */

import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

import { FileDeploymentTracker } from './deployment-tracker';
import { DockerManager } from './docker-manager';

const execAsync = promisify(exec);

const TEST_DEPLOYMENT_ID = 'test-repo-9999';
const mockLogger = {
  debug: () => void 0,
  error: () => void 0,
  info: () => void 0,
  warn: () => void 0,
  child: () => mockLogger,
};

async function getRemoteHeadSha(cloneUrl: string, branch: string): Promise<string> {
  const { stdout } = await execAsync(`git ls-remote ${cloneUrl} refs/heads/${branch}`);
  const match = stdout.trim().split(/\s/)[0];
  if (!match) {
    throw new Error(`Could not get HEAD sha for ${cloneUrl} ${branch}`);
  }
  return match;
}

const dockerTestRepoUrl = process.env.DOCKER_TEST_REPO_URL;
const describeIfRepo = dockerTestRepoUrl ? describe : describe.skip;

describeIfRepo('DockerManager Integration', () => {
  let deploymentsDir: string;
  let deploymentsDb: string;
  let tracker: FileDeploymentTracker;
  let dockerManager: DockerManager;

  beforeAll(async () => {
    const baseDir = path.join(
      os.tmpdir(),
      `preview-docker-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    deploymentsDir = path.join(baseDir, 'deployments');
    deploymentsDb = path.join(baseDir, 'deployments.json');
    await fs.mkdir(deploymentsDir, { recursive: true });
    await fs.mkdir(path.dirname(deploymentsDb), { recursive: true });
    await fs.writeFile(
      deploymentsDb,
      JSON.stringify({ deployments: {}, portAllocations: {} }, null, 2),
      'utf-8',
    );
    tracker = new FileDeploymentTracker(deploymentsDb, mockLogger as never);
    const templatesDir = path.join(__dirname, '../templates');
    dockerManager = new DockerManager(deploymentsDir, templatesDir, tracker, mockLogger as never);
  }, 10000);

  afterAll(async () => {
    try {
      const deployment = tracker.getDeployment(TEST_DEPLOYMENT_ID);
      if (deployment) {
        await dockerManager.cleanupPreview(TEST_DEPLOYMENT_ID);
      }
    } catch {
      // ignore
    }
    try {
      await fs.rm(path.dirname(deploymentsDb), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should deploy preview and then cleanup', async () => {
    const branch = 'main';
    const commitSha = await getRemoteHeadSha(dockerTestRepoUrl!, branch);
    const projectSlug = 'test-org-test-repo';

    const config = {
      prNumber: 9999,
      repoName: 'test-repo',
      repoOwner: 'test-org',
      projectSlug,
      deploymentId: TEST_DEPLOYMENT_ID,
      branch,
      commitSha,
      cloneUrl: dockerTestRepoUrl!,
      framework: 'nestjs' as const,
      dbType: 'postgres' as const,
    };

    const result = await dockerManager.deployPreview(config);

    expect(result.url).toBeDefined();
    expect(result.appPort).toBeGreaterThanOrEqual(8000);
    expect(result.exposedDbPort).toBeGreaterThanOrEqual(9000);

    await tracker.saveDeployment({
      ...config,
      framework: result.framework,
      dbType: result.dbType,
      appPort: result.appPort,
      exposedDbPort: result.exposedDbPort,
      exposedAppPort: result.exposedAppPort,
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      url: result.url,
    });
    expect(tracker.getDeployment(TEST_DEPLOYMENT_ID)).toBeDefined();

    await dockerManager.cleanupPreview(TEST_DEPLOYMENT_ID);

    expect(tracker.getDeployment(TEST_DEPLOYMENT_ID)).toBeUndefined();
  }, 120000);
});
