import { DeploymentInfo, PreviewStatus } from './preview-config';

export interface DeploymentStore {
  deployments: Record<number, DeploymentInfo>;
  portAllocations: Record<number, { appPort: number; dbPort: number }>;
}

export interface DeploymentTracker {
  getDeployment(prNumber: number): DeploymentInfo | undefined;
  saveDeployment(deployment: DeploymentInfo): void;
  deleteDeployment(prNumber: number): void;
  getAllDeployments(): DeploymentInfo[];
  updateDeploymentStatus(prNumber: number, status: PreviewStatus): void;
  updateDeploymentComment(prNumber: number, commentId: number): void;
  allocatePorts(prNumber: number): { appPort: number; dbPort: number };
  releasePorts(prNumber: number): void;
  getDeploymentAge(prNumber: number): number; // Returns age in days
}
