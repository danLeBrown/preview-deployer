import { IDeploymentInfo, TPreviewStatus } from './preview-config';

export interface IDeploymentStore {
  deployments: Record<number, IDeploymentInfo>;
  portAllocations: Record<number, { appPort: number; dbPort: number }>;
}

export interface IDeploymentTracker {
  getDeployment(prNumber: number): IDeploymentInfo | undefined;
  saveDeployment(deployment: IDeploymentInfo): Promise<void>;
  deleteDeployment(prNumber: number): Promise<void>;
  getAllDeployments(): IDeploymentInfo[];
  updateDeploymentStatus(prNumber: number, status: TPreviewStatus): Promise<void>;
  updateDeploymentComment(prNumber: number, commentId: number): Promise<void>;
  allocatePorts(prNumber: number): { appPort: number; dbPort: number };
  releasePorts(prNumber: number): Promise<void>;
  getDeploymentAge(prNumber: number): number; // Returns age in days
}
