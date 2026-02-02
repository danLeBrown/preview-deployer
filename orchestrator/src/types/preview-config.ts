export type TFramework = 'nestjs' | 'go' | 'laravel';
export type TDatabaseType = 'postgres' | 'mysql' | 'mongodb';
export type TPreviewStatus = 'building' | 'running' | 'failed' | 'stopped';
export type TPRStatus = 'open' | 'closed' | 'merged';

/** Known extra service template names (e.g. redis for BullMQ). */
export type TExtraService = 'redis';

/** Parsed from repo-root preview-config.yml; all fields optional. */
export interface IRepoPreviewConfig {
  framework?: TFramework;
  database?: TDatabaseType;
  health_check_path?: string;
  build_commands?: string[];
  extra_services?: TExtraService[];
  env?: string[];
  /** Path(s) to env file(s) relative to repo root (e.g. .env). Loaded by Compose at runtime. */
  env_file?: string | string[];
  /** Commands run inside the app container before the main process (e.g. migrations, seeding). */
  startup_commands?: string[];
  dockerfile?: string;
}

export interface IPreviewConfig {
  prNumber: number;
  repoName: string;
  repoOwner: string;
  /** Filesystem/URL-safe slug from owner/name (e.g. myorg-myapp). Used for paths and nginx. */
  projectSlug: string;
  /** Unique id: projectSlug-prNumber (e.g. myorg-myapp-12). */
  deploymentId: string;
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
  projectSlug: string;
  deploymentId: string;
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
  appPort: number;
  dbPort: number;
}
