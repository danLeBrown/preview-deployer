export type Framework = 'nestjs' | 'go';
export type DatabaseType = 'postgres' | 'mysql' | 'mongodb';
export type PreviewStatus = 'building' | 'running' | 'failed' | 'stopped';
export type PRStatus = 'open' | 'closed' | 'merged';

export interface PreviewConfig {
  prNumber: number;
  repoName: string;
  repoOwner: string;
  branch: string;
  commitSha: string;
  cloneUrl: string;
  framework: Framework;
  dbType: DatabaseType;
}

export interface DeploymentInfo {
  prNumber: number;
  repoName: string;
  repoOwner: string;
  branch: string;
  commitSha: string;
  framework: Framework;
  dbType: DatabaseType;
  appPort: number;
  dbPort: number;
  status: PreviewStatus;
  createdAt: string;
  updatedAt: string;
  url?: string;
  commentId?: number;
}

export interface WebhookPayload {
  action: 'opened' | 'synchronize' | 'closed' | 'reopened';
  pull_request: {
    number: number;
    head: {
      ref: string;
      sha: string;
      repo: {
        clone_url: string;
        name: string;
        owner: {
          login: string;
        };
      };
    };
    base: {
      ref: string;
    };
  };
  repository: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
}

export interface PortAllocation {
  prNumber: number;
  appPort: number;
  dbPort: number;
}
