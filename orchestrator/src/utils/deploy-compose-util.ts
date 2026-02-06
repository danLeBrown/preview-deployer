import * as fs from 'fs/promises';

import { IValidatedRepoPreviewConfig } from '../repo-config';
import { IPortAllocation } from '../types/deployment';
import {
  applyRepoConfigToAppService,
  dumpCompose,
  ensurePreviewComposeExtension,
  getComposeFilePath,
  getGeneratedComposeFilePath,
  hasRepoPreviewCompose,
  injectPortsIntoRepoCompose,
  parseComposeToObject,
} from './compose-utils';

export interface ResolveComposeOptionsDeploy {
  mode: 'deploy';
  /** Called when repo has no docker-compose.preview; returns path to written compose file. */
  generateCompose: () => Promise<string>;
}

export interface ResolveComposeOptionsUpdate {
  mode: 'update';
}

/**
 * Resolves the compose file path for deploy or update: either uses repo docker-compose.preview
 * (with ports and repo config injected) or template-generated / existing compose.
 */
export async function resolveAndWriteComposeFile(
  workDir: string,
  repoConfig: IValidatedRepoPreviewConfig,
  portAllocation: IPortAllocation,
  options: ResolveComposeOptionsDeploy | ResolveComposeOptionsUpdate,
): Promise<{ composeFile: string; useRepoCompose: boolean }> {
  await ensurePreviewComposeExtension(workDir);
  const useRepoCompose = await hasRepoPreviewCompose(workDir);

  if (useRepoCompose) {
    const repoComposePath = getComposeFilePath(workDir);
    const repoComposeContent = await fs.readFile(repoComposePath, 'utf-8');
    const composeObj = parseComposeToObject(repoComposeContent);
    injectPortsIntoRepoCompose(composeObj, repoConfig, portAllocation);
    applyRepoConfigToAppService(composeObj, repoConfig);
    const generatedPath = getGeneratedComposeFilePath(workDir);
    await fs.writeFile(generatedPath, dumpCompose(composeObj), 'utf-8');
    return { composeFile: generatedPath, useRepoCompose: true };
  }

  if (options.mode === 'update') {
    return { composeFile: getComposeFilePath(workDir), useRepoCompose: false };
  }

  const composeFile = await options.generateCompose();
  return { composeFile, useRepoCompose: false };
}

export interface BuildAndHealthCheckDeps {
  runCompose: (workDir: string, deploymentId: string, composeFile: string) => Promise<void>;
  waitForHealthy: (
    exposedAppPort: number,
    healthCheckPath: string,
    maxAttempts: number,
  ) => Promise<{ healthUrl: string; isHealthy: boolean }>;
  logInfo: (obj: Record<string, unknown>, msg: string) => void;
}

/**
 * Runs docker compose up --build, logs, then waits for app health. Returns health result;
 * caller should throw if !isHealthy.
 */
export async function buildContainersAndWaitForHealthy(
  workDir: string,
  deploymentId: string,
  composeFile: string,
  exposedAppPort: number,
  healthCheckPath: string,
  useRepoCompose: boolean,
  deps: BuildAndHealthCheckDeps,
): Promise<{ isHealthy: boolean; healthUrl: string }> {
  const { runCompose, waitForHealthy, logInfo } = deps;

  logInfo({ deploymentId, useRepoCompose }, 'Building containers');
  await runCompose(workDir, deploymentId, composeFile);
  logInfo({ deploymentId, useRepoCompose }, 'Done building containers. Starting health check.');

  const { isHealthy, healthUrl } = await waitForHealthy(exposedAppPort, healthCheckPath, 15);
  return { isHealthy, healthUrl };
}
