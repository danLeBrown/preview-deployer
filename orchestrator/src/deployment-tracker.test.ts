import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { FileDeploymentTracker } from './deployment-tracker';
import type { IDeploymentStore } from './types/deployment';
import type { IDeploymentInfo } from './types/preview-config';

interface MockLogger {
  debug: jest.Mock;
  error: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  child: jest.Mock;
}

function createMockLogger(): MockLogger {
  const logger: MockLogger = {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(),
  };
  logger.child.mockImplementation(() => createMockLogger());
  return logger;
}

function writeStore(storePath: string, store: IDeploymentStore): void {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
}

function readStore(storePath: string): IDeploymentStore {
  const data = fs.readFileSync(storePath, 'utf-8');
  return JSON.parse(data) as IDeploymentStore;
}

describe('FileDeploymentTracker', () => {
  let storePath: string;
  let logger: MockLogger;
  let tracker: FileDeploymentTracker;

  beforeEach(() => {
    storePath = path.join(
      os.tmpdir(),
      `preview-deployer-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    writeStore(storePath, { deployments: {}, portAllocations: {} });
    logger = createMockLogger();
    tracker = new FileDeploymentTracker(storePath, logger as unknown as import('pino').Logger);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(storePath);
    } catch {
      // ignore
    }
  });

  describe('allocatePorts', () => {
    it('should allocate first available app and db ports (8000, 9000) for first deployment', () => {
      const result = tracker.allocatePorts('myorg-myapp-1');
      expect(result).toEqual({ exposedAppPort: 8000, exposedDbPort: 9000 });
      const store = readStore(storePath);
      expect(store.portAllocations['myorg-myapp-1']).toEqual({
        exposedAppPort: 8000,
        exposedDbPort: 9000,
      });
    });

    it('should return same ports for same deploymentId when already allocated', () => {
      tracker.allocatePorts('myorg-myapp-1');
      const result = tracker.allocatePorts('myorg-myapp-1');
      expect(result).toEqual({ exposedAppPort: 8000, exposedDbPort: 9000 });
    });

    it('should allocate next free app and db ports for second deployment', () => {
      tracker.allocatePorts('myorg-myapp-1');
      const result = tracker.allocatePorts('myorg-myapp-2');
      expect(result).toEqual({ exposedAppPort: 8001, exposedDbPort: 9001 });
    });

    it('should skip used ports when finding next free', () => {
      writeStore(storePath, {
        deployments: {},
        portAllocations: {
          'a-1': { exposedAppPort: 8000, exposedDbPort: 9000 },
          'b-2': { exposedAppPort: 8001, exposedDbPort: 9001 },
        },
      });
      tracker = new FileDeploymentTracker(storePath, logger as unknown as import('pino').Logger);
      const result = tracker.allocatePorts('c-3');
      expect(result).toEqual({ exposedAppPort: 8002, exposedDbPort: 9002 });
    });
  });

  describe('releasePorts', () => {
    it('should remove port allocation for deploymentId', async () => {
      tracker.allocatePorts('myorg-myapp-1');
      await tracker.releasePorts('myorg-myapp-1');
      const store = readStore(storePath);
      expect(store.portAllocations['myorg-myapp-1']).toBeUndefined();
    });
  });

  describe('getDeployment / saveDeployment', () => {
    it('should return undefined when deployment does not exist', () => {
      expect(tracker.getDeployment('myorg-myapp-99')).toBeUndefined();
    });

    it('should save and retrieve deployment', async () => {
      const deployment: IDeploymentInfo = {
        prNumber: 12,
        repoName: 'myapp',
        repoOwner: 'myorg',
        projectSlug: 'myorg-myapp',
        deploymentId: 'myorg-myapp-12',
        branch: 'feature',
        commitSha: 'abc123',
        framework: 'nestjs',
        dbType: 'postgres',
        appPort: 8012,
        exposedDbPort: 9012,
        exposedAppPort: 8012,
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await tracker.saveDeployment(deployment);
      expect(tracker.getDeployment('myorg-myapp-12')).toEqual(deployment);
    });
  });

  describe('getAllDeployments', () => {
    it('should return empty array when no deployments', () => {
      expect(tracker.getAllDeployments()).toEqual([]);
    });

    it('should return all deployments', async () => {
      await tracker.saveDeployment({
        prNumber: 1,
        repoName: 'r',
        repoOwner: 'o',
        projectSlug: 'o-r',
        deploymentId: 'o-r-1',
        branch: 'main',
        commitSha: 's',
        framework: 'nestjs',
        dbType: 'postgres',
        appPort: 8000,
        exposedDbPort: 9000,
        exposedAppPort: 8000,
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const all = tracker.getAllDeployments();
      expect(all).toHaveLength(1);
      expect(all[0].deploymentId).toBe('o-r-1');
    });
  });

  describe('deleteDeployment', () => {
    it('should remove deployment from store', async () => {
      await tracker.saveDeployment({
        prNumber: 1,
        repoName: 'r',
        repoOwner: 'o',
        projectSlug: 'o-r',
        deploymentId: 'o-r-1',
        branch: 'main',
        commitSha: 's',
        framework: 'nestjs',
        dbType: 'postgres',
        appPort: 8000,
        exposedDbPort: 9000,
        exposedAppPort: 8000,
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await tracker.deleteDeployment('o-r-1');
      expect(tracker.getDeployment('o-r-1')).toBeUndefined();
    });
  });

  describe('getDeploymentAge', () => {
    it('should return Infinity when deployment not found', () => {
      expect(tracker.getDeploymentAge('missing')).toBe(Infinity);
    });

    it('should return age in days for existing deployment', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 2);
      await tracker.saveDeployment({
        prNumber: 1,
        repoName: 'r',
        repoOwner: 'o',
        projectSlug: 'o-r',
        deploymentId: 'o-r-1',
        branch: 'main',
        commitSha: 's',
        framework: 'nestjs',
        dbType: 'postgres',
        appPort: 8000,
        exposedAppPort: 8000,
        exposedDbPort: 9000,
        status: 'running',
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
      });
      const age = tracker.getDeploymentAge('o-r-1');
      expect(age).toBeGreaterThanOrEqual(1.9);
      expect(age).toBeLessThanOrEqual(2.1);
    });
  });
});
