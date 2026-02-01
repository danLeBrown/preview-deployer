import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import * as path from 'path';

import { fileExists } from './framework-detection';
import { IRepoPreviewConfig, TDatabaseType, TFramework } from './types/preview-config';

const PREVIEW_CONFIG_FILENAME = 'preview-config.yml';

const VALID_FRAMEWORKS: TFramework[] = ['nestjs', 'go', 'laravel'];
const VALID_DATABASES: TDatabaseType[] = ['postgres', 'mysql', 'mongodb'];

function isTFramework(value: unknown): value is TFramework {
  return typeof value === 'string' && VALID_FRAMEWORKS.includes(value as TFramework);
}

function isTDatabaseType(value: unknown): value is TDatabaseType {
  return typeof value === 'string' && VALID_DATABASES.includes(value as TDatabaseType);
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
  if (isTDatabaseType(obj.database)) {
    out.database = obj.database;
  }
  if (typeof obj.health_check_path === 'string' && obj.health_check_path.length > 0) {
    const healthPath = obj.health_check_path.startsWith('/')
      ? obj.health_check_path
      : `/${obj.health_check_path}`;
    out.health_check_path = healthPath;
  }
  if (
    Array.isArray(obj.build_commands) &&
    obj.build_commands.every((c): c is string => typeof c === 'string')
  ) {
    out.build_commands = obj.build_commands;
  }
  if (Array.isArray(obj.env) && obj.env.every((e): e is string => typeof e === 'string')) {
    out.env = obj.env;
  }
  if (typeof obj.dockerfile === 'string' && obj.dockerfile.length > 0) {
    out.dockerfile = obj.dockerfile;
  }
  return out;
}

/**
 * Read and parse preview-config.yml from the repo at workDir.
 * Returns null if the file is missing or invalid.
 */
export async function readRepoPreviewConfig(workDir: string): Promise<IRepoPreviewConfig | null> {
  if (!(await fileExists(workDir, PREVIEW_CONFIG_FILENAME))) {
    return null;
  }
  const filePath = path.join(workDir, PREVIEW_CONFIG_FILENAME);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const raw = yaml.load(content);
    return parseRepoPreviewConfig(raw);
  } catch {
    return null;
  }
}
