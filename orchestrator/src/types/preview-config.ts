export type TFramework = 'nestjs' | 'go' | 'laravel' | 'rust' | 'python';
export type TDatabaseType = 'postgres' | 'mysql' | 'mongodb';
export type TPreviewStatus = 'building' | 'running' | 'failed' | 'stopped';
export type TPRStatus = 'open' | 'closed' | 'merged';

/** Known extra service template names (e.g. redis for BullMQ). */
export type TExtraServiceWithoutDatabase = 'redis';

export type TExtraService = TExtraServiceWithoutDatabase | TDatabaseType;

/** Parsed from repo-root preview-config.yml.
 * Required fields (framework, database, health_check_path, app_port, app_port_env, app_entrypoint) are validated by repo-config.
 * Optional fields are: build_commands, extra_services, env, env_file, startup_commands, dockerfile.
 */
export interface IRepoPreviewConfig {
  framework?: TFramework;
  database?: TDatabaseType;
  health_check_path?: string;
  /** Entrypoint for the app (e.g. dist/main.js for NestJS, server for Go). Used in Dockerfile CMD. */
  app_entrypoint?: string;
  build_commands?: string[];
  extra_services?: TExtraServiceWithoutDatabase[];
  env?: string[];
  /** Path to env file relative to repo root (e.g. .env). Loaded by Compose into the app container at runtime. */
  env_file?: string;
  /** Commands run inside the app container before the main process (e.g. migrations, seeding). */
  startup_commands?: string[];
  dockerfile?: string;
  /** Port the app listens on. */
  app_port?: number;
  /** Environment variable name for the app port. */
  app_port_env?: string;
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
  // dbPort: number;
  exposedAppPort: number;
  exposedDbPort: number;
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
