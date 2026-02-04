import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import * as path from 'path';

import {
  IRepoPreviewConfig,
  TDatabaseType,
  TExtraService,
  TExtraServiceWithoutDatabase,
  TFramework,
} from './types/preview-config';
import { fileExists } from './utils/framework-detection';

const PREVIEW_CONFIG_FILENAME = 'preview-config.yml';

const VALID_FRAMEWORKS: TFramework[] = ['nestjs', 'go', 'laravel', 'rust', 'python'];
const VALID_DATABASES: TDatabaseType[] = ['postgres', 'mysql', 'mongodb'];
const VALID_EXTRA_SERVICES: TExtraService[] = ['redis', ...VALID_DATABASES];

export const REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS = {
  framework: (value: unknown): value is TFramework => isTFramework(value),
  database: (value: unknown): value is TDatabaseType => isTDatabaseType(value),
  health_check_path: (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0 && value.startsWith('/'),
  app_port: (value: unknown): value is number => typeof value === 'number' && value > 0,
  app_port_env: (value: unknown): value is string => typeof value === 'string' && value.length > 0,
  app_entrypoint: (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0,
} as const;

export type TRequiredRepoPreviewConfigFields = keyof typeof REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS;

export const OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS = {
  build_commands: (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((v): v is string => typeof v === 'string'),
  extra_services: (value: unknown): value is TExtraService[] =>
    Array.isArray(value) && value.every((v): v is TExtraService => typeof v === 'string'),
  startup_commands: (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((v): v is string => typeof v === 'string'),
  env_file: (value: unknown): value is string | string[] =>
    (typeof value === 'string' && value.length > 0) ||
    (Array.isArray(value) &&
      value.every((v): v is string => typeof v === 'string' && v.length > 0)),
} as const;

export type TOptionalRepoPreviewConfigFields = keyof typeof OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS;

export type IValidatedRepoPreviewConfig = Required<
  Pick<IRepoPreviewConfig, TRequiredRepoPreviewConfigFields>
> &
  Partial<Pick<IRepoPreviewConfig, TOptionalRepoPreviewConfigFields>>;

function isTFramework(value: unknown): value is TFramework {
  return typeof value === 'string' && VALID_FRAMEWORKS.includes(value as TFramework);
}

function isTDatabaseType(value: unknown): value is TDatabaseType {
  return typeof value === 'string' && VALID_DATABASES.includes(value as TDatabaseType);
}

function parseExtraServices(value: unknown): TExtraServiceWithoutDatabase[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (v): v is TExtraServiceWithoutDatabase =>
      typeof v === 'string' && VALID_EXTRA_SERVICES.includes(v as TExtraService),
  );
}

/** Parse raw YAML into IRepoPreviewConfig, validating and normalizing fields. */
function parseRepoPreviewConfig(raw: unknown): IRepoPreviewConfig {
  if (raw === null || typeof raw !== 'object') {
    return {};
  }
  const obj = raw as Record<string, unknown>;
  const out: IRepoPreviewConfig = {};
  if (isTFramework(obj.framework)) {
    out.framework = obj.framework;
  }
  if (typeof obj.app_port === 'number' && obj.app_port > 0) {
    out.app_port = obj.app_port;
  }
  if (typeof obj.app_port_env === 'string' && obj.app_port_env.length > 0) {
    out.app_port_env = obj.app_port_env;
  }
  if (isTDatabaseType(obj.database)) {
    out.database = obj.database;
  }
  if (typeof obj.health_check_path === 'string' && obj.health_check_path.length > 0) {
    const healthPath = obj.health_check_path.startsWith('/')
      ? obj.health_check_path
      : `/${obj.health_check_path}`;
    out.health_check_path = healthPath;
  }
  if (typeof obj.app_entrypoint === 'string' && obj.app_entrypoint.length > 0) {
    out.app_entrypoint = obj.app_entrypoint;
  }
  if (
    Array.isArray(obj.build_commands) &&
    obj.build_commands.every((c): c is string => typeof c === 'string')
  ) {
    out.build_commands = obj.build_commands;
  }
  const extra = parseExtraServices(obj.extra_services);
  if (extra.length > 0) {
    out.extra_services = extra;
  }
  if (Array.isArray(obj.env) && obj.env.every((e): e is string => typeof e === 'string')) {
    out.env = obj.env;
  }
  if (typeof obj.env_file === 'string' && obj.env_file.length > 0) {
    out.env_file = obj.env_file;
  } else if (
    Array.isArray(obj.env_file) &&
    obj.env_file.every((e): e is string => typeof e === 'string' && e.length > 0)
  ) {
    out.env_file = obj.env_file;
  }
  if (
    Array.isArray(obj.startup_commands) &&
    obj.startup_commands.every((c): c is string => typeof c === 'string')
  ) {
    out.startup_commands = obj.startup_commands;
  }
  if (typeof obj.dockerfile === 'string' && obj.dockerfile.length > 0) {
    out.dockerfile = obj.dockerfile;
  }
  return out;
}

function validateRepoPreviewConfig(config: IRepoPreviewConfig): void {
  Object.entries(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS).forEach(([field, validator]) => {
    if (!validator(config[field as keyof IRepoPreviewConfig])) {
      throw new Error(`${field} is required`);
    }
  });
  Object.entries(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS).forEach(([field, validator]) => {
    if (
      config[field as keyof IRepoPreviewConfig] &&
      !validator(config[field as keyof IRepoPreviewConfig])
    ) {
      throw new Error(`${field} is not valid`);
    }
  });
}

/**
 * Read and parse preview-config.yml from the repo at workDir.
 * Throws if the file is missing or if validation fails (with a specific error message).
 */
export async function readRepoPreviewConfig(workDir: string): Promise<IValidatedRepoPreviewConfig> {
  const filePath = path.join(workDir, PREVIEW_CONFIG_FILENAME);
  if (!(await fileExists(workDir, PREVIEW_CONFIG_FILENAME))) {
    throw new Error(`${PREVIEW_CONFIG_FILENAME} is required at repository root but was not found`);
  }
  const content = await fs.readFile(filePath, 'utf-8');
  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${PREVIEW_CONFIG_FILENAME} is invalid YAML: ${msg}`);
  }
  const config = parseRepoPreviewConfig(raw);
  validateRepoPreviewConfig(config);
  return config as IValidatedRepoPreviewConfig;
}
