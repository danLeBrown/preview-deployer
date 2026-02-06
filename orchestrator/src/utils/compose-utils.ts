import * as fs from 'fs/promises';
import * as Handlebars from 'handlebars';
import * as yaml from 'js-yaml';
import * as path from 'path';

import { IValidatedRepoPreviewConfig } from '../repo-config';
import { IPortAllocation } from '../types/deployment';
import { TDatabaseType, TFramework } from '../types/preview-config';
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
  exposedAppPort: number;
  exposedDbPort: number;
  appPort: number;
  appPortEnv: string;
  dbType: TDatabaseType;
  /** Optional env file path from preview-config env_file (e.g. .env). */
  envFile?: string;
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
  repoConfig: IValidatedRepoPreviewConfig,
  portAllocation: IPortAllocation,
): void {
  const services = (composeObj.services ?? {}) as Record<string, unknown>;

  const app = services.app;
  if (app !== null && typeof app === 'object') {
    (app as Record<string, unknown>).ports = [
      `${portAllocation.exposedAppPort}:${repoConfig.app_port}`,
    ];
  }

  composeObj.services = services;
}

/** Default CMD per framework (must match Dockerfile template). Used when startup_commands override entrypoint. */
export function getDefaultCommandForFramework(
  framework: TFramework,
  app_entrypoint: string,
  app_port: number,
): string[] {
  switch (framework) {
    case 'nestjs':
      return ['node', app_entrypoint];
    case 'go':
    case 'rust':
      return ['./' + app_entrypoint];
    case 'python':
      return ['uvicorn', app_entrypoint, '--host', '0.0.0.0', '--port', String(app_port)];
    case 'laravel':
      return ['php', 'artisan', 'serve', '--host=0.0.0.0', '--port=' + String(app_port)];
    default:
      return ['node', app_entrypoint];
  }
}

/** Render Handlebars compose template with template data. Pure, testable. */
export function renderComposeTemplate<T extends Partial<IComposeTemplateData>>(
  templateContent: string,
  data: T,
): string {
  const template = Handlebars.compile(templateContent);
  return template(data);
}

/** Parse YAML compose content to object. Pure, testable. */
export function parseComposeToObject(composeContent: string): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return (yaml.load(composeContent) as Record<string, unknown>) ?? {};
}

export function applyRepoConfigToAppService(
  composeObj: Record<string, unknown>,
  repoConfig: IValidatedRepoPreviewConfig,
): void {
  const services = (composeObj.services ?? {}) as Record<string, unknown>;
  const app = (services.app ?? {}) as Record<string, unknown>;

  if (repoConfig.env?.length || repoConfig.env_file) {
    const currentEnv = app.environment;
    const env = Array.isArray(currentEnv) ? (currentEnv as string[]) : [];
    if (repoConfig.env?.length) {
      app.environment = [...env, ...repoConfig.env];
    }
    if (repoConfig.env_file) {
      app.env_file = repoConfig.env_file;
    }
  }

  if (repoConfig.startup_commands?.length) {
    const script = [...repoConfig.startup_commands, 'exec "$@"'].join(' && ');
    app.entrypoint = ['/bin/sh', '-c', script, '--'];
    app.command = getDefaultCommandForFramework(
      repoConfig.framework,
      repoConfig.app_entrypoint,
      repoConfig.app_port,
    );
  }

  composeObj.services = services;
}

/** Serialize compose object to YAML string. */
export function dumpCompose(composeObj: Record<string, unknown>): string {
  return yaml.dump(composeObj, { lineWidth: -1 });
}
