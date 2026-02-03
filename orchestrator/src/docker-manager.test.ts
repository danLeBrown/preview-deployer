/**
 * DockerManager unit tests (mocked dependencies).
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { DockerManager } from './docker-manager';
import type { IDeploymentTracker } from './types/deployment';

const mockLogger: {
  debug: jest.Mock;
  error: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  child: jest.Mock;
} = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  child: jest.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

function createMockTracker(allocatePorts: jest.Mock): IDeploymentTracker {
  return {
    getDeployment: jest.fn().mockReturnValue(undefined),
    saveDeployment: jest.fn().mockResolvedValue(undefined),
    deleteDeployment: jest.fn().mockResolvedValue(undefined),
    getAllDeployments: jest.fn().mockReturnValue([]),
    updateDeploymentStatus: jest.fn().mockResolvedValue(undefined),
    updateDeploymentComment: jest.fn().mockResolvedValue(undefined),
    allocatePorts,
    releasePorts: jest.fn().mockResolvedValue(undefined),
    getDeploymentAge: jest.fn().mockReturnValue(0),
  };
}

describe('DockerManager', () => {
  let deploymentsDir: string;
  let templatesDir: string;

  beforeEach(async () => {
    const baseDir = path.join(
      os.tmpdir(),
      `preview-docker-unit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    deploymentsDir = path.join(baseDir, 'deployments');
    templatesDir = path.join(__dirname, '../templates');
    await fs.mkdir(deploymentsDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(path.dirname(deploymentsDir), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('deployPreview allocation path', () => {
    it('should call allocatePorts with excludePorts from getDockerBoundHostPorts', async () => {
      const allocatePorts = jest.fn().mockReturnValue({
        exposedAppPort: 8001,
        exposedDbPort: 9001,
      });
      const tracker = createMockTracker(allocatePorts);
      const dockerManager = new DockerManager(
        deploymentsDir,
        templatesDir,
        tracker,
        mockLogger as never,
      );

      const config = {
        prNumber: 1,
        repoName: 'repo',
        repoOwner: 'org',
        projectSlug: 'org-repo',
        deploymentId: 'org-repo-1',
        branch: 'main',
        commitSha: 'abc123',
        cloneUrl: 'https://invalid.invalid/nonexistent.git',
      };

      await expect(dockerManager.deployPreview(config)).rejects.toThrow();

      expect(allocatePorts).toHaveBeenCalledWith('org-repo-1', {
        excludePorts: expect.any(Array),
      });
    });
  });

  describe('getDockerBoundHostPorts', () => {
    it('should return an array of host ports (or empty if Docker unavailable)', async () => {
      const allocatePorts = jest.fn().mockReturnValue({
        exposedAppPort: 8000,
        exposedDbPort: 9000,
      });
      const tracker = createMockTracker(allocatePorts);
      const dockerManager = new DockerManager(
        deploymentsDir,
        templatesDir,
        tracker,
        mockLogger as never,
      );

      const ports = await dockerManager.getDockerBoundHostPorts();

      expect(Array.isArray(ports)).toBe(true);
      expect(ports.every((p) => typeof p === 'number' && p >= 0 && p <= 65535)).toBe(true);
    });
  });
});
