import { exec } from 'child_process';
import Docker, { ContainerInspectInfo } from 'dockerode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from 'pino';
import { promisify } from 'util';

import { IValidatedRepoPreviewConfig, readRepoPreviewConfig } from './repo-config';
import { IDeploymentTracker, IPortAllocation } from './types/deployment';
import {
  IPreviewConfig,
  TDatabaseType,
  TExtraService,
  TExtraServiceWithoutDatabase,
  TFramework,
} from './types/preview-config';
import {
  applyRepoConfigToAppService,
  dumpCompose,
  ensurePreviewComposeExtension,
  getComposeFilePath,
  getGeneratedComposeFilePath,
  hasRepoPreviewCompose,
  injectPortsIntoRepoCompose,
  parseComposeToObject,
  renderComposeTemplate,
} from './utils/compose-utils';
import { directoryExists, fileExists, resolveFramework } from './utils/framework-detection';
import { loadExtraServiceBlock } from './utils/load-extra-service-compose-utils';
import { mergeExtraService } from './utils/merge-extra-service-util';

const execAsync = promisify(exec);

export const DOCKER_COMPOSE_TEMPLATES_DIR = 'docker-compose';
export const DOCKERFILE_TEMPLATES_DIR = 'dockerfile';
export const EXTRA_SERVICE_TEMPLATES_DIR = 'extra-service';

export class DockerManager {
  private docker: Docker;
  private deploymentsDir: string;
  private dockerComposeTemplatesDir: string;
  private dockerfileTemplatesDir: string;
  private extraServiceTemplatesDir: string;
  private tracker: IDeploymentTracker;
  private logger: Logger;

  constructor(
    deploymentsDir: string,
    templatesDir: string,
    tracker: IDeploymentTracker,
    logger: Logger,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.docker = new Docker();
    this.deploymentsDir = deploymentsDir;
    this.dockerComposeTemplatesDir = path.join(templatesDir, DOCKER_COMPOSE_TEMPLATES_DIR);
    this.dockerfileTemplatesDir = path.join(templatesDir, DOCKERFILE_TEMPLATES_DIR);
    this.extraServiceTemplatesDir = path.join(templatesDir, EXTRA_SERVICE_TEMPLATES_DIR);
    this.tracker = tracker;
    this.logger = logger;
  }

  /**
   * Returns host ports currently bound by running Docker containers.
   * Used during port allocation so we never assign a port still in use (e.g. by a failed deployment's containers).
   * On error (e.g. Docker unavailable), returns [] and logs so allocation can still proceed.
   */
  async getDockerBoundHostPorts(): Promise<number[]> {
    try {
      const containers = await this.docker.listContainers();
      const bound = new Set<number>();
      for (const c of containers) {
        for (const p of c.Ports) {
          bound.add(p.PublicPort);
        }
      }
      return [...bound];
    } catch (error: unknown) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Could not list Docker bound ports; allocation will not exclude them',
      );
      return [];
    }
  }

  async deployPreview(config: IPreviewConfig): Promise<{
    url: string;
    appPort: number;
    exposedAppPort: number;
    exposedDbPort: number;
    framework: TFramework;
    dbType: TDatabaseType;
  }> {
    const workDir = path.join(this.deploymentsDir, config.projectSlug, `pr-${config.prNumber}`);
    const boundPorts = await this.getDockerBoundHostPorts();
    const portAllocation = this.tracker.allocatePorts(config.deploymentId, {
      excludePorts: boundPorts,
    });

    try {
      // verify that the workDir does not exist
      if (await directoryExists(workDir)) {
        await fs.rm(workDir, { recursive: true, force: true });
      }

      // Create working directory
      await fs.mkdir(workDir, { recursive: true });

      // Clone repository
      this.logger.info({ prNumber: config.prNumber, branch: config.branch }, 'Cloning repository');
      await execAsync(`git clone ${config.cloneUrl} ${workDir}`, {
        cwd: this.deploymentsDir,
      });

      // Checkout branch
      await execAsync(`git checkout ${config.branch}`, { cwd: workDir });
      await execAsync(`git reset --hard ${config.commitSha}`, { cwd: workDir });

      // Read and validate repo preview-config.yml (required)
      const repoConfig = await readRepoPreviewConfig(workDir);
      const framework = await resolveFramework(workDir, repoConfig);
      const dbType: TDatabaseType = repoConfig.database;
      const healthCheckPath = repoConfig.health_check_path;
      const appPort = repoConfig.app_port;

      this.logger.info(
        {
          prNumber: config.prNumber,
          framework,
          dbType,
          appPort,
          healthCheckPath,
          fromRepoConfig: Boolean(repoConfig),
        },
        'Resolved framework and database',
      );

      // Run build_commands from preview-config.yml (e.g. cp .env.example .env); fail on non-zero
      if (repoConfig.build_commands?.length) {
        for (let i = 0; i < repoConfig.build_commands.length; i++) {
          const cmd = repoConfig.build_commands[i];
          this.logger.info(
            { prNumber: config.prNumber, cmd, index: i + 1 },
            'Running build command',
          );
          try {
            await execAsync(cmd, { cwd: workDir });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(
              `Build command failed (${i + 1}/${repoConfig.build_commands.length}): ${cmd} — ${msg}`,
            );
          }
        }
      }

      // Ensure repo has a Dockerfile; inject framework default if missing
      await this.ensureDockerfile(workDir, framework, repoConfig);

      // Normalize .yaml → .yml if repo has only docker-compose.preview.yaml; then check for repo compose
      await ensurePreviewComposeExtension(workDir);
      const useRepoCompose = await hasRepoPreviewCompose(workDir);
      let composeFile: string;
      if (useRepoCompose) {
        const repoComposePath = getComposeFilePath(workDir);
        const repoComposeContent = await fs.readFile(repoComposePath, 'utf-8');
        const composeObj = parseComposeToObject(repoComposeContent);
        injectPortsIntoRepoCompose(composeObj, repoConfig, portAllocation);
        applyRepoConfigToAppService(composeObj, repoConfig);
        const generatedPath = getGeneratedComposeFilePath(workDir);
        await fs.writeFile(generatedPath, dumpCompose(composeObj), 'utf-8');
        composeFile = generatedPath;
      } else {
        composeFile = await this.generateDockerCompose(
          config.projectSlug,
          config.prNumber,
          repoConfig,
          portAllocation,
          repoConfig.extra_services ?? [],
          workDir,
        );
      }

      this.logger.info(
        { deploymentId: config.deploymentId, useRepoCompose },
        'Building containers',
      );
      await execAsync(`docker compose -p ${config.deploymentId} -f ${composeFile} up -d --build`, {
        cwd: workDir,
      });

      // Wait for health check
      const { isHealthy, healthUrl } = await this.waitForHealthy(
        portAllocation.exposedAppPort,
        healthCheckPath,
        15,
      );
      if (!isHealthy) {
        throw new Error(`Health check at ${healthUrl} failed for PR #${config.prNumber}`);
      }

      const url = `${process.env.PREVIEW_BASE_URL || 'http://localhost'}/${config.projectSlug}/pr-${config.prNumber}/`;
      this.logger.info({ deploymentId: config.deploymentId, url }, 'Preview deployed successfully');

      return {
        url,
        appPort,
        exposedAppPort: portAllocation.exposedAppPort,
        exposedDbPort: portAllocation.exposedDbPort,
        framework,
        dbType,
      };
    } catch (error: unknown) {
      this.logger.error(
        {
          deploymentId: config.deploymentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to deploy preview',
      );
      // Cleanup on failure
      await this.cleanupPreview(config.deploymentId).catch((cleanupError) => {
        this.logger.error(
          {
            deploymentId: config.deploymentId,
            error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
          },
          'Failed to cleanup after deployment failure',
        );
      });
      throw error;
    }
  }

  async updatePreview(deploymentId: string, commitSha: string): Promise<void> {
    const deployment = this.tracker.getDeployment(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }
    const workDir = path.join(
      this.deploymentsDir,
      deployment.projectSlug,
      `pr-${deployment.prNumber}`,
    );

    try {
      // Pull latest changes
      await execAsync(`git fetch origin`, { cwd: workDir });
      await execAsync(`git reset --hard ${commitSha}`, { cwd: workDir });

      // Normalize .yaml → .yml if needed; then rebuild (same compose file as deploy)
      await ensurePreviewComposeExtension(workDir);
      const useRepoCompose = await hasRepoPreviewCompose(workDir);
      let composeFile: string;
      const repoConfig = await readRepoPreviewConfig(workDir);

      if (useRepoCompose) {
        const repoComposePath = getComposeFilePath(workDir);
        const repoComposeContent = await fs.readFile(repoComposePath, 'utf-8');
        const composeObj = parseComposeToObject(repoComposeContent);
        injectPortsIntoRepoCompose(composeObj, repoConfig, {
          exposedAppPort: deployment.exposedAppPort,
          exposedDbPort: deployment.exposedDbPort,
        });
        applyRepoConfigToAppService(composeObj, repoConfig);
        const generatedPath = getGeneratedComposeFilePath(workDir);
        await fs.writeFile(generatedPath, dumpCompose(composeObj), 'utf-8');
        composeFile = generatedPath;
      } else {
        composeFile = getComposeFilePath(workDir);
      }
      await execAsync(`docker compose -p ${deploymentId} -f ${composeFile} up -d --build`, {
        cwd: workDir,
      });

      // Wait for health check (use repo preview-config path if present)
      const healthCheckPath = repoConfig.health_check_path;
      const { isHealthy, healthUrl } = await this.waitForHealthy(
        deployment.exposedAppPort,
        healthCheckPath,
        15,
      );
      if (!isHealthy) {
        throw new Error(`Health check at ${healthUrl} failed after update: ${deploymentId}`);
      }

      this.logger.info({ deploymentId }, 'Preview updated successfully');
    } catch (error: unknown) {
      this.logger.error(
        { deploymentId, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to update preview',
      );
      throw error;
    }
  }

  async cleanupPreview(deploymentId: string): Promise<void> {
    const deployment = this.tracker.getDeployment(deploymentId);
    if (!deployment) {
      this.logger.warn({ deploymentId }, 'Deployment not found for cleanup');
      await this.tracker.releasePorts(deploymentId).catch((error) => {
        this.logger.error(
          { deploymentId, error: error instanceof Error ? error.message : 'Unknown error' },
          'Failed to release ports',
        );
      });
      return;
    }
    const workDir = path.join(
      this.deploymentsDir,
      deployment.projectSlug,
      `pr-${deployment.prNumber}`,
    );
    const useRepoCompose = await hasRepoPreviewCompose(workDir);
    const composeFile = useRepoCompose
      ? getGeneratedComposeFilePath(workDir)
      : getComposeFilePath(workDir);

    try {
      // Stop and remove containers
      try {
        await execAsync(`docker compose -p ${deploymentId} -f ${composeFile} down -v`, {
          cwd: workDir,
        });
      } catch (error: unknown) {
        // Ignore if compose file doesn't exist
        this.logger.warn({ deploymentId }, 'Docker compose file not found during cleanup');
      }

      // Remove working directory
      await fs.rm(workDir, { recursive: true, force: true });

      // Release ports
      await this.tracker.releasePorts(deploymentId);

      this.logger.info({ deploymentId }, 'Preview cleaned up successfully');
    } catch (error: unknown) {
      this.logger.error(
        { deploymentId, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to cleanup preview',
      );
      throw error;
    }
  }

  async getPreviewStatus(deploymentId: string): Promise<'running' | 'stopped' | 'failed'> {
    const deployment = this.tracker.getDeployment(deploymentId);
    const containerName = deployment
      ? `${deployment.projectSlug}-pr-${deployment.prNumber}-app`
      : `${deploymentId}-app`;
    try {
      const container = this.docker.getContainer(containerName);
      const info = (await container.inspect()) as unknown as ContainerInspectInfo;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (info.State.Running) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return 'running';
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      } else if (info.State.Status === 'exited' && info.State.ExitCode === 0) {
        return 'stopped';
      }
      return 'failed';
    } catch (error: unknown) {
      this.logger.warn(
        { deploymentId, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to get container status',
      );
      return 'stopped';
    }
  }

  private async ensureDockerfile(
    workDir: string,
    framework: TFramework,
    repoConfig: IValidatedRepoPreviewConfig,
  ): Promise<void> {
    // check if Dockerfile/dockerfile exists in the PR directory
    if (await fileExists(workDir, 'Dockerfile')) {
      this.logger.info({ workDir }, 'Dockerfile exists in the PR directory');
      return;
    }

    if (await fileExists(workDir, 'dockerfile')) {
      this.logger.info({ workDir }, 'dockerfile exists in the PR directory');
      // Normalize to Dockerfile so compose (dockerfile: Dockerfile) works on case-sensitive FS (e.g. Linux)
      const src = path.join(workDir, 'dockerfile');
      const dest = path.join(workDir, 'Dockerfile');
      await fs.copyFile(src, dest);
      this.logger.info({ workDir }, 'Copied dockerfile to Dockerfile for compose compatibility');
      return;
    }

    // if not, use the framework template
    const templateName = `Dockerfile.${framework}.hbs`;
    const src = path.join(this.dockerfileTemplatesDir, templateName);
    const templateContent = await fs.readFile(src, 'utf-8');
    const dockerfileContent = renderComposeTemplate(templateContent, {
      appPort: repoConfig.app_port,
      appEntrypoint: repoConfig.app_entrypoint,
      dbType: repoConfig.database,
    });
    await fs.writeFile(path.join(workDir, 'Dockerfile'), dockerfileContent, 'utf-8');
    this.logger.info({ workDir, framework }, 'Injected default Dockerfile for framework');
  }

  private async generateDockerCompose(
    projectSlug: string,
    prNumber: number,
    repoConfig: IValidatedRepoPreviewConfig,
    portAllocation: IPortAllocation,
    extraServices: TExtraServiceWithoutDatabase[],
    workDir: string,
  ): Promise<string> {
    const templateNames: Record<TFramework, string> = {
      nestjs: 'docker-compose.nestjs.yml.hbs',
      go: 'docker-compose.go.yml.hbs',
      laravel: 'docker-compose.laravel.yml.hbs',
      rust: 'docker-compose.rust.yml.hbs',
      python: 'docker-compose.python.yml.hbs',
    };
    const templatePath = path.join(
      this.dockerComposeTemplatesDir,
      templateNames[repoConfig.framework],
    );
    const templateContent = await fs.readFile(templatePath, 'utf-8');

    const composeContent = renderComposeTemplate(templateContent, {
      projectSlug,
      prNumber,
      appPort: portAllocation.exposedAppPort,
      dbPort: portAllocation.exposedDbPort,
      appPortEnv: repoConfig.app_port_env,
      dbType: repoConfig.database,
    });
    const composeObj = parseComposeToObject(composeContent);

    const allServices: TExtraService[] = Array.from(
      new Set<TExtraService>([...extraServices, repoConfig.database]),
    );
    await Promise.all(
      allServices.map(async (service) => {
        const block = await loadExtraServiceBlock(this.extraServiceTemplatesDir, {
          extraService: service,
          projectSlug,
          prNumber,
          exposedDbPort: portAllocation.exposedDbPort,
        });

        mergeExtraService(composeObj, service, block);
      }),
    );

    applyRepoConfigToAppService(composeObj, repoConfig);

    const composeFile = getComposeFilePath(workDir);
    await fs.writeFile(composeFile, dumpCompose(composeObj), 'utf-8');
    return composeFile;
  }

  private async waitForHealthy(
    exposedAppPort: number,
    healthPath: string,
    maxAttempts: number,
  ): Promise<{
    healthUrl: string;
    isHealthy: boolean;
  }> {
    const normalizedPath = healthPath.startsWith('/') ? healthPath : `/${healthPath}`;
    const healthUrl = `http://localhost:${exposedAppPort}${normalizedPath}`;
    const delay = 5000; // 5 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          this.logger.info({ exposedAppPort, attempt }, 'Health check passed');
          return { healthUrl, isHealthy: true };
        }
      } catch (error: unknown) {
        // Ignore errors and retry
        this.logger.debug(
          {
            exposedAppPort,
            attempt,
            healthUrl,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Health check attempt failed',
        );
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    this.logger.warn({ exposedAppPort, maxAttempts }, 'Health check timeout');
    return { healthUrl, isHealthy: false };
  }
}
