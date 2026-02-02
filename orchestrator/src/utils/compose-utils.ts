import * as fs from 'fs/promises';
import * as Handlebars from 'handlebars';
import * as yaml from 'js-yaml';
import * as path from 'path';

import {
  IRepoPreviewConfig,
  TDatabaseType,
  TExtraService,
  TFramework,
} from '../types/preview-config';
import { fileExists } from './framework-detection';

/** Preview compose filename (standard). Repo may provide it or we generate it. Same name either way. */
export const COMPOSE_PREVIEW_FILENAME = 'docker-compose.preview.yml';

/** Generated compose file: repo compose with ports injected. Used for docker compose -f when repo has preview compose. */
export const COMPOSE_PREVIEW_GENERATED_FILENAME = 'docker-compose.preview.generated.yml';

/** Alternate extension we accept; normalized to .yml so one standard path is used everywhere. */
export const COMPOSE_PREVIEW_FILENAME_YAML = 'docker-compose.preview.yaml';

/** Exact filenames we accept for repo-owned preview compose. No fuzzy matching. */
const REPO_PREVIEW_COMPOSE_NAMES = [
  COMPOSE_PREVIEW_FILENAME,
  COMPOSE_PREVIEW_FILENAME_YAML,
] as const;

/** Data passed into Handlebars compose templates. */
export interface IComposeTemplateData {
  projectSlug: string;
  prNumber: number;
  appPort: number;
  dbPort: number;
}

/** Returns true if the repo has docker-compose.preview.yml or docker-compose.preview.yaml in workDir (exact names only). */
export async function hasRepoPreviewCompose(workDir: string): Promise<boolean> {
  for (const name of REPO_PREVIEW_COMPOSE_NAMES) {
    if (await fileExists(workDir, name)) {
      return true;
    }
  }
  return false;
}

/**
 * Normalize to .yml: if only docker-compose.preview.yaml exists, rename it to docker-compose.preview.yml.
 * Call before using compose so getComposeFilePath always points at .yml.
 */
export async function ensurePreviewComposeExtension(workDir: string): Promise<void> {
  const ymlPath = path.join(workDir, COMPOSE_PREVIEW_FILENAME);
  const yamlPath = path.join(workDir, COMPOSE_PREVIEW_FILENAME_YAML);
  const hasYml = await fileExists(workDir, COMPOSE_PREVIEW_FILENAME);
  const hasYaml = await fileExists(workDir, COMPOSE_PREVIEW_FILENAME_YAML);
  if (!hasYml && hasYaml) {
    await fs.rename(yamlPath, ymlPath);
  }
}

/** Path to the preview compose file (repo-owned or generated; always .yml). */
export function getComposeFilePath(workDir: string): string {
  return path.join(workDir, COMPOSE_PREVIEW_FILENAME);
}

/** Path to the generated compose file (repo compose with ports injected). Use for docker compose -f when repo has preview compose. */
export function getGeneratedComposeFilePath(workDir: string): string {
  return path.join(workDir, COMPOSE_PREVIEW_GENERATED_FILENAME);
}

/** Default container port for app per framework (NestJS 3000, Go 8080, Laravel 8000). */
export const APP_CONTAINER_PORT_BY_FRAMEWORK: Record<TFramework, number> = {
  nestjs: 3000,
  go: 8080,
  laravel: 8000,
};

/** Default container port for db per database type. */
export const DB_CONTAINER_PORT_BY_DATABASE: Record<TDatabaseType, number> = {
  postgres: 5432,
  mysql: 3306,
  mongodb: 27017,
};

/**
 * Inject or override host port mappings for app and db services in a repo-owned compose object.
 * We own host port allocation; repo must not specify host ports for app/db in docker-compose.preview.yml.
 * Mutates composeObj. Only sets ports for services that exist.
 */
export function injectPortsIntoRepoCompose(
  composeObj: Record<string, unknown>,
  appPort: number,
  dbPort: number,
  framework: TFramework,
  dbType: TDatabaseType,
): void {
  const services = (composeObj.services ?? {}) as Record<string, unknown>;
  const appContainerPort = APP_CONTAINER_PORT_BY_FRAMEWORK[framework];
  const dbContainerPort = DB_CONTAINER_PORT_BY_DATABASE[dbType];

  const app = services.app;
  if (app !== null && typeof app === 'object') {
    (app as Record<string, unknown>).ports = [`${appPort}:${appContainerPort}`];
  }

  const db = services.db;
  if (db !== null && typeof db === 'object') {
    (db as Record<string, unknown>).ports = [`${dbPort}:${dbContainerPort}`];
  }

  composeObj.services = services;
}

/** Default CMD per framework (must match Dockerfile template). Used when startup_commands override entrypoint. */
export function getDefaultCommandForFramework(framework: TFramework): string[] {
  const commands: Record<TFramework, string[]> = {
    nestjs: ['node', 'dist/main'],
    go: ['./server'],
    laravel: ['php', 'artisan', 'serve', '--host=0.0.0.0', '--port=8000'],
  };
  return commands[framework];
}

/** Render Handlebars compose template with template data. Pure, testable. */
export function renderComposeTemplate(templateContent: string, data: IComposeTemplateData): string {
  const template = Handlebars.compile(templateContent);
  return template(data);
}

/** Parse YAML compose content to object. Pure, testable. */
export function parseComposeToObject(composeContent: string): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return (yaml.load(composeContent) as Record<string, unknown>) ?? {};
}

/** Merge extra services (e.g. redis) into compose object: add service block, app env, app depends_on. Mutates composeObj. */
export function mergeExtraServices(
  composeObj: Record<string, unknown>,
  extraServices: TExtraService[],
  redisServiceBlock: Record<string, unknown>,
): void {
  const services = (composeObj.services ?? {}) as Record<string, unknown>;
  const app = (services.app ?? {}) as Record<string, unknown>;

  for (const name of extraServices) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (name === 'redis') {
      (services as Record<string, unknown>).redis = redisServiceBlock;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const env = (app.environment as string[]) ?? [];
      if (!env.some((e) => e.startsWith('REDIS_URL='))) {
        app.environment = [...env, 'REDIS_URL=redis://redis:6379'];
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const dependsOn = (app.depends_on as Record<string, unknown>) ?? {};
      (dependsOn as Record<string, unknown>).redis = { condition: 'service_started' };
      app.depends_on = dependsOn;
    }
  }

  composeObj.services = services;
}

/** Wire env, env_file, and startup_commands from repo preview-config into app service. Mutates composeObj. */
export function applyRepoConfigToAppService(
  composeObj: Record<string, unknown>,
  repoConfig: IRepoPreviewConfig | undefined,
  framework: TFramework,
): void {
  const services = (composeObj.services ?? {}) as Record<string, unknown>;
  const app = (services.app ?? {}) as Record<string, unknown>;

  if (repoConfig?.env?.length || repoConfig?.env_file) {
    const currentEnv = app.environment;
    const env = Array.isArray(currentEnv) ? (currentEnv as string[]) : [];
    if (repoConfig.env?.length) {
      app.environment = [...env, ...repoConfig.env];
    }
    if (repoConfig.env_file) {
      app.env_file = Array.isArray(repoConfig.env_file)
        ? repoConfig.env_file
        : [repoConfig.env_file];
    }
  }

  if (repoConfig?.startup_commands?.length) {
    const script = [...repoConfig.startup_commands, 'exec "$@"'].join(' && ');
    app.entrypoint = ['/bin/sh', '-c', script, '--'];
    app.command = getDefaultCommandForFramework(framework);
  }

  composeObj.services = services;
}

/** Serialize compose object to YAML string. */
export function dumpCompose(composeObj: Record<string, unknown>): string {
  return yaml.dump(composeObj, { lineWidth: -1 });
}
