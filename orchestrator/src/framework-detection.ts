import * as fs from 'fs/promises';
import * as path from 'path';

import { TFramework } from './types/preview-config';

/** Check if a file exists at dir/file (no throw). */
export async function fileExists(dir: string, file: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, file));
    return true;
  } catch {
    return false;
  }
}

/** Read and parse package.json; returns null if missing or invalid. */
export async function readPackageJson(dir: string): Promise<{
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} | null> {
  const filePath = path.join(dir, 'package.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw) as unknown as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return data;
  } catch {
    return null;
  }
}

/** True if package.json has the given dependency or devDependency. */
export async function hasPackageJsonDependency(dir: string, name: string): Promise<boolean> {
  const pkg = await readPackageJson(dir);
  if (!pkg) return false;
  return !!(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

/** Read and parse composer.json; returns null if missing or invalid. */
export async function readComposerJson(
  dir: string,
): Promise<{ require?: Record<string, string>; 'require-dev'?: Record<string, string> } | null> {
  const filePath = path.join(dir, 'composer.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw) as unknown as {
      require?: Record<string, string>;
      'require-dev'?: Record<string, string>;
    };
    return data;
  } catch {
    return null;
  }
}

/** True if composer.json has the given require or require-dev. */
export async function hasComposerDependency(dir: string, name: string): Promise<boolean> {
  const composer = await readComposerJson(dir);
  if (!composer) return false;
  return !!(composer.require?.[name] ?? composer['require-dev']?.[name]);
}

/** A detector returns the framework if the repo matches, otherwise null. */
export type FrameworkDetector = (workDir: string) => Promise<TFramework | null>;

/** NestJS: nest-cli.json or @nestjs/core in package.json. */
export const detectNestJS: FrameworkDetector = async (workDir: string) => {
  if (await fileExists(workDir, 'nest-cli.json')) return 'nestjs';
  if (await hasPackageJsonDependency(workDir, '@nestjs/core')) return 'nestjs';
  return null;
};

/** Go: go.mod present. */
export const detectGo: FrameworkDetector = async (workDir: string) => {
  if (await fileExists(workDir, 'go.mod')) return 'go';
  return null;
};

/** Laravel: laravel/framework in composer.json. */
export const detectLaravel: FrameworkDetector = async (workDir: string) => {
  if (await hasComposerDependency(workDir, 'laravel/framework')) return 'laravel';
  return null;
};

/** Default framework when detection fails. */
const DEFAULT_FRAMEWORK: TFramework = 'nestjs';

/** Ordered list of detectors; first match wins. */
const DETECTORS: FrameworkDetector[] = [detectNestJS, detectGo, detectLaravel];

/**
 * Detect the application framework for the repo at workDir.
 * Runs detectors in order; returns DEFAULT_FRAMEWORK if none match.
 */
export async function detectFramework(workDir: string): Promise<TFramework> {
  for (const detector of DETECTORS) {
    const framework = await detector(workDir);
    if (framework) return framework;
  }
  return DEFAULT_FRAMEWORK;
}
