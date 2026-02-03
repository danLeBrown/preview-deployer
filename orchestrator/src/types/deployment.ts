import { IDeploymentInfo, TPreviewStatus } from './preview-config';

export interface IPortAllocation {
  exposedAppPort: number;
  exposedDbPort: number;
}

export interface IDeploymentStore {
  /** Keyed by deploymentId (e.g. myorg-myapp-12). */
  deployments: Record<string, IDeploymentInfo>;
  /** Keyed by deploymentId. */
  portAllocations: Record<string, IPortAllocation>;
}

export interface IDeploymentTracker {
  getDeployment(deploymentId: string): IDeploymentInfo | undefined;
  saveDeployment(deployment: IDeploymentInfo): Promise<void>;
  deleteDeployment(deploymentId: string): Promise<void>;
  getAllDeployments(): IDeploymentInfo[];
  updateDeploymentStatus(deploymentId: string, status: TPreviewStatus): Promise<void>;
  updateDeploymentComment(deploymentId: string, commentId: number): Promise<void>;
  allocatePorts(deploymentId: string): IPortAllocation;
  releasePorts(deploymentId: string): Promise<void>;
  getDeploymentAge(deploymentId: string): number; // Returns age in days
}
