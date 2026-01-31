import { DeploymentInfo, PreviewStatus } from './preview-config';

export interface DeploymentStore {
  deployments: Record<number, DeploymentInfo>;
  portAllocations: Record<number, { appPort: number; dbPort: number }>;
}

export interface DeploymentTracker {
  getDeployment(prNumber: number): DeploymentInfo | undefined;
  saveDeployment(deployment: DeploymentInfo): Promise<void>;
  deleteDeployment(prNumber: number): Promise<void>;
  getAllDeployments(): DeploymentInfo[];
  updateDeploymentStatus(prNumber: number, status: PreviewStatus): Promise<void>;
  updateDeploymentComment(prNumber: number, commentId: number): Promise<void>;
  allocatePorts(prNumber: number): { appPort: number; dbPort: number };
  releasePorts(prNumber: number): Promise<void>;
  getDeploymentAge(prNumber: number): number; // Returns age in days
}
