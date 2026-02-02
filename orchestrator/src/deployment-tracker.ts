import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import { Logger } from 'pino';

import { IDeploymentStore, IDeploymentTracker } from './types/deployment';
import { IDeploymentInfo, TPreviewStatus } from './types/preview-config';

export class FileDeploymentTracker implements IDeploymentTracker {
  private storePath: string;
  private logger: Logger;

  constructor(storePath: string, logger: Logger) {
    this.storePath = storePath;
    this.logger = logger;
  }

  private async loadStore(): Promise<IDeploymentStore> {
    try {
      const data = await fs.readFile(this.storePath, 'utf-8');
      return JSON.parse(data) as IDeploymentStore;
    } catch (error: unknown) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to read deployment store',
      );

      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { deployments: {}, portAllocations: {} };
      }
      throw error;
    }
  }

  private async saveStore(store: IDeploymentStore): Promise<void> {
    await fs.writeFile(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  getDeployment(deploymentId: string): IDeploymentInfo | undefined {
    // Synchronous read for immediate access (used in hot paths)
    try {
      const data = fsSync.readFileSync(this.storePath, 'utf-8');
      const store = JSON.parse(data) as IDeploymentStore;
      return store.deployments[deploymentId];
    } catch (error: unknown) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to read deployment store',
      );

      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      return undefined;
    }
  }

  async saveDeployment(deployment: IDeploymentInfo): Promise<void> {
    const store = await this.loadStore();
    store.deployments[deployment.deploymentId] = deployment;
    await this.saveStore(store);
    this.logger.debug({ deploymentId: deployment.deploymentId }, 'Saved deployment');
  }

  async deleteDeployment(deploymentId: string): Promise<void> {
    const store = await this.loadStore();
    delete store.deployments[deploymentId];
    await this.saveStore(store);
    this.logger.debug({ deploymentId }, 'Deleted deployment');
  }

  getAllDeployments(): IDeploymentInfo[] {
    try {
      const data = fsSync.readFileSync(this.storePath, 'utf-8');
      const store = JSON.parse(data) as IDeploymentStore;
      return Object.values(store.deployments);
    } catch (error: unknown) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to read deployments',
      );
      return [];
    }
  }

  async updateDeploymentStatus(deploymentId: string, status: TPreviewStatus): Promise<void> {
    const store = await this.loadStore();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (store.deployments[deploymentId]) {
      store.deployments[deploymentId].status = status;
      store.deployments[deploymentId].updatedAt = new Date().toISOString();
      await this.saveStore(store);
      this.logger.debug({ deploymentId, status }, 'Updated deployment status');
    }
  }

  async updateDeploymentComment(deploymentId: string, commentId: number): Promise<void> {
    const store = await this.loadStore();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (store.deployments[deploymentId]) {
      store.deployments[deploymentId].commentId = commentId;
      await this.saveStore(store);
      this.logger.debug({ deploymentId, commentId }, 'Updated deployment comment ID');
    }
  }

  allocatePorts(deploymentId: string): { appPort: number; dbPort: number } {
    const APP_BASE = 8000;
    const DB_BASE = 9000;

    try {
      const data = fsSync.readFileSync(this.storePath, 'utf-8');
      const store = JSON.parse(data) as IDeploymentStore;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (store.portAllocations[deploymentId]) {
        return store.portAllocations[deploymentId];
      }

      const allocatedPorts = Object.values(store.portAllocations);
      const usedApp = new Set(allocatedPorts.map((p) => p.appPort));
      const usedDb = new Set(allocatedPorts.map((p) => p.dbPort));

      let appPort = APP_BASE;
      while (usedApp.has(appPort) && appPort <= 65535) {
        appPort++;
      }
      let dbPort = DB_BASE;
      while (usedDb.has(dbPort) && dbPort <= 65535) {
        dbPort++;
      }

      if (appPort > 65535 || dbPort > 65535) {
        throw new Error(`Port allocation exhausted for deployment ${deploymentId}`);
      }

      store.portAllocations[deploymentId] = { appPort, dbPort };
      fsSync.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');

      this.logger.info({ deploymentId, appPort, dbPort }, 'Allocated ports');
      return { appPort, dbPort };
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error({ error: error.message }, 'Failed to allocate ports');
      } else {
        this.logger.error({ error: 'Unknown error' }, 'Failed to allocate ports');
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const store: IDeploymentStore = {
          deployments: {},
          portAllocations: { [deploymentId]: { appPort: APP_BASE, dbPort: DB_BASE } },
        };
        fsSync.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
        this.logger.info({ deploymentId, appPort: APP_BASE, dbPort: DB_BASE }, 'Allocated ports');
        return { appPort: APP_BASE, dbPort: DB_BASE };
      }
      throw error;
    }
  }

  async releasePorts(deploymentId: string): Promise<void> {
    const store = await this.loadStore();
    delete store.portAllocations[deploymentId];
    await this.saveStore(store);
    this.logger.debug({ deploymentId }, 'Released ports');
  }

  getDeploymentAge(deploymentId: string): number {
    try {
      const deployment = this.getDeployment(deploymentId);
      if (!deployment) {
        return Infinity; // Not found, consider it old
      }
      const createdAt = new Date(deployment.createdAt);
      const now = new Date();
      const diffMs = now.getTime() - createdAt.getTime();
      return diffMs / (1000 * 60 * 60 * 24); // Convert to days
    } catch (error: unknown) {
      this.logger.error(
        { deploymentId, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to get deployment age',
      );
      return Infinity;
    }
  }
}
