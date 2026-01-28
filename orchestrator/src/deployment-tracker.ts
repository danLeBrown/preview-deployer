import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { DeploymentInfo, PreviewStatus } from './types/preview-config';
import { DeploymentStore, DeploymentTracker } from './types/deployment';

export class FileDeploymentTracker implements DeploymentTracker {
  private storePath: string;
  private logger: any;

  constructor(storePath: string, logger: any) {
    this.storePath = storePath;
    this.logger = logger;
  }

  private async loadStore(): Promise<DeploymentStore> {
    try {
      const data = await fs.readFile(this.storePath, 'utf-8');
      return JSON.parse(data);
    } catch (error: any) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { deployments: {}, portAllocations: {} };
      }
      throw error;
    }
  }

  private async saveStore(store: DeploymentStore): Promise<void> {
    await fs.writeFile(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  getDeployment(prNumber: number): DeploymentInfo | undefined {
    // Synchronous read for immediate access (used in hot paths)
    try {
      const data = fsSync.readFileSync(this.storePath, 'utf-8');
      const store: DeploymentStore = JSON.parse(data);
      return store.deployments[prNumber];
    } catch (error: any) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      this.logger.error({ error: error.message }, 'Failed to read deployment store');
      return undefined;
    }
  }

  async saveDeployment(deployment: DeploymentInfo): Promise<void> {
    const store = await this.loadStore();
    store.deployments[deployment.prNumber] = deployment;
    await this.saveStore(store);
    this.logger.debug({ prNumber: deployment.prNumber }, 'Saved deployment');
  }

  async deleteDeployment(prNumber: number): Promise<void> {
    const store = await this.loadStore();
    delete store.deployments[prNumber];
    await this.saveStore(store);
    this.logger.debug({ prNumber }, 'Deleted deployment');
  }

  getAllDeployments(): DeploymentInfo[] {
    try {
      const data = fsSync.readFileSync(this.storePath, 'utf-8');
      const store: DeploymentStore = JSON.parse(data);
      return Object.values(store.deployments);
    } catch (error: any) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      this.logger.error({ error: error.message }, 'Failed to read deployments');
      return [];
    }
  }

  async updateDeploymentStatus(prNumber: number, status: PreviewStatus): Promise<void> {
    const store = await this.loadStore();
    if (store.deployments[prNumber]) {
      store.deployments[prNumber].status = status;
      store.deployments[prNumber].updatedAt = new Date().toISOString();
      await this.saveStore(store);
      this.logger.debug({ prNumber, status }, 'Updated deployment status');
    }
  }

  async updateDeploymentComment(prNumber: number, commentId: number): Promise<void> {
    const store = await this.loadStore();
    if (store.deployments[prNumber]) {
      store.deployments[prNumber].commentId = commentId;
      await this.saveStore(store);
      this.logger.debug({ prNumber, commentId }, 'Updated deployment comment ID');
    }
  }

  allocatePorts(prNumber: number): { appPort: number; dbPort: number } {
    // Synchronous for immediate allocation
    try {
      const data = fsSync.readFileSync(this.storePath, 'utf-8');
      const store: DeploymentStore = JSON.parse(data);

      // Check if ports already allocated
      if (store.portAllocations[prNumber]) {
        return store.portAllocations[prNumber];
      }

      // Allocate ports: app = 8000 + prNumber, db = 9000 + prNumber
      const appPort = 8000 + prNumber;
      const dbPort = 9000 + prNumber;

      // Validate port range
      if (appPort > 65535 || dbPort > 65535) {
        throw new Error(`Port allocation out of range for PR #${prNumber}`);
      }

      // Check for collisions
      const allocatedPorts = Object.values(store.portAllocations);
      const appCollision = allocatedPorts.some((p) => p.appPort === appPort);
      const dbCollision = allocatedPorts.some((p) => p.dbPort === dbPort);

      if (appCollision || dbCollision) {
        throw new Error(`Port collision detected for PR #${prNumber}`);
      }

      store.portAllocations[prNumber] = { appPort, dbPort };
      fsSync.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');

      this.logger.info({ prNumber, appPort, dbPort }, 'Allocated ports');
      return { appPort, dbPort };
    } catch (error: any) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // First deployment, create store
        const appPort = 8000 + prNumber;
        const dbPort = 9000 + prNumber;
        const store: DeploymentStore = {
          deployments: {},
          portAllocations: { [prNumber]: { appPort, dbPort } },
        };
        fsSync.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
        return { appPort, dbPort };
      }
      throw error;
    }
  }

  async releasePorts(prNumber: number): Promise<void> {
    const store = await this.loadStore();
    delete store.portAllocations[prNumber];
    await this.saveStore(store);
    this.logger.debug({ prNumber }, 'Released ports');
  }

  getDeploymentAge(prNumber: number): number {
    try {
      const deployment = this.getDeployment(prNumber);
      if (!deployment) {
        return Infinity; // Not found, consider it old
      }
      const createdAt = new Date(deployment.createdAt);
      const now = new Date();
      const diffMs = now.getTime() - createdAt.getTime();
      return diffMs / (1000 * 60 * 60 * 24); // Convert to days
    } catch (error: any) {
      this.logger.error({ prNumber, error: error.message }, 'Failed to get deployment age');
      return Infinity;
    }
  }
}
