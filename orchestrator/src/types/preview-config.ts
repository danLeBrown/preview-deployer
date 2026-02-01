export type TFramework = 'nestjs' | 'go' | 'laravel';
export type TDatabaseType = 'postgres' | 'mysql' | 'mongodb';
export type TPreviewStatus = 'building' | 'running' | 'failed' | 'stopped';
export type TPRStatus = 'open' | 'closed' | 'merged';

export interface IPreviewConfig {
  prNumber: number;
  repoName: string;
  repoOwner: string;
  branch: string;
  commitSha: string;
  cloneUrl: string;
  framework: TFramework;
  dbType: TDatabaseType;
}

export interface IDeploymentInfo {
  prNumber: number;
  repoName: string;
  repoOwner: string;
  branch: string;
  commitSha: string;
  framework: TFramework;
  dbType: TDatabaseType;
  appPort: number;
  dbPort: number;
  status: TPreviewStatus;
  createdAt: string;
  updatedAt: string;
  url?: string;
  commentId?: number;
}

export interface IWebhookPayload {
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

export interface IPortAllocation {
  prNumber: number;
  appPort: number;
  dbPort: number;
}
