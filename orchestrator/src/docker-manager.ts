import { exec } from 'child_process';
import Docker, { ContainerInspectInfo } from 'dockerode';
import * as fs from 'fs/promises';
import * as Handlebars from 'handlebars';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { Logger } from 'pino';
import { promisify } from 'util';

import { fileExists, resolveFramework } from './framework-detection';
import { readRepoPreviewConfig } from './repo-config';
import { IDeploymentTracker } from './types/deployment';
import {
  IPreviewConfig,
  IRepoPreviewConfig,
  TDatabaseType,
  TExtraService,
  TFramework,
} from './types/preview-config';

const execAsync = promisify(exec);

export class DockerManager {
  private docker: Docker;
  private deploymentsDir: string;
  private templatesDir: string;
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
    this.templatesDir = templatesDir;
    this.tracker = tracker;
    this.logger = logger;
  }

  async deployPreview(config: IPreviewConfig): Promise<{
    url: string;
    appPort: number;
    dbPort: number;
    framework: TFramework;
    dbType: TDatabaseType;
  }> {
    const workDir = path.join(this.deploymentsDir, config.projectSlug, `pr-${config.prNumber}`);
    const { appPort, dbPort } = this.tracker.allocatePorts(config.deploymentId);

    try {
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

      // Read repo preview-config.yml if present; use for framework, database, health path
      const repoConfig = await readRepoPreviewConfig(workDir);
      const framework = await resolveFramework(workDir, repoConfig);
      const dbType: TDatabaseType = repoConfig?.database ?? config.dbType;
      const healthCheckPath = repoConfig?.health_check_path ?? '/health';
      this.logger.info(
        { prNumber: config.prNumber, framework, dbType, fromRepoConfig: Boolean(repoConfig) },
        'Resolved framework and database',
      );

      // Run build_commands from preview-config.yml (e.g. cp .env.example .env); fail on non-zero
      if (repoConfig?.build_commands?.length) {
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
      await this.ensureDockerfile(workDir, framework);

      // Generate docker-compose file (base + extra services + env/env_file from preview-config)
      const composeFile = await this.generateDockerCompose(
        config.projectSlug,
        config.prNumber,
        appPort,
        dbPort,
        framework,
        repoConfig?.extra_services ?? [],
        workDir,
        repoConfig ?? undefined,
      );

      this.logger.info({ deploymentId: config.deploymentId }, 'Building containers');
      await execAsync(`docker compose -p ${config.deploymentId} -f ${composeFile} up -d --build`, {
        cwd: workDir,
      });

      // Wait for health check
      const isHealthy = await this.waitForHealthy(appPort, healthCheckPath, 60);
      if (!isHealthy) {
        throw new Error(`Health check failed for PR #${config.prNumber}`);
      }

      const url = `${process.env.PREVIEW_BASE_URL || 'http://localhost'}/${config.projectSlug}/pr-${config.prNumber}/`;
      this.logger.info({ deploymentId: config.deploymentId, url }, 'Preview deployed successfully');

      return { url, appPort, dbPort, framework, dbType };
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

      // Rebuild and restart containers
      const composeFile = path.join(workDir, 'docker-compose.preview.yml');
      await execAsync(`docker compose -p ${deploymentId} -f ${composeFile} up -d --build`, {
        cwd: workDir,
      });

      // Wait for health check (use repo preview-config path if present)
      const repoConfig = await readRepoPreviewConfig(workDir);
      const healthCheckPath = repoConfig?.health_check_path ?? '/health';
      const isHealthy = await this.waitForHealthy(deployment.appPort, healthCheckPath, 60);
      if (!isHealthy) {
        throw new Error(`Health check failed after update: ${deploymentId}`);
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
    const composeFile = path.join(workDir, 'docker-compose.preview.yml');

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

  private async ensureDockerfile(workDir: string, framework: TFramework): Promise<void> {
    // check if Dockerfile/dockerfile exists in the PR directory
    if (await fileExists(workDir, 'Dockerfile')) {
      this.logger.info({ workDir }, 'Dockerfile exists in the PR directory');
      console.log(await fs.readFile(path.join(workDir, 'Dockerfile'), 'utf-8'));
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
    const templateName = `Dockerfile.${framework}`;
    const src = path.join(this.templatesDir, templateName);
    const dest = path.join(workDir, 'Dockerfile');
    try {
      await fs.copyFile(src, dest);
      this.logger.info({ workDir, framework }, 'Injected default Dockerfile for framework');
    } catch (error: unknown) {
      this.logger.warn(
        { workDir, framework, error: error instanceof Error ? error.message : 'Unknown error' },
        'No Dockerfile in repo and framework template missing; build may fail',
      );
    }
  }

  private async generateDockerCompose(
    projectSlug: string,
    prNumber: number,
    appPort: number,
    dbPort: number,
    framework: TFramework,
    extraServices: TExtraService[],
    workDir: string,
    repoConfig?: IRepoPreviewConfig,
  ): Promise<string> {
    const templateNames: Record<TFramework, string> = {
      nestjs: 'docker-compose.nestjs.yml.hbs',
      go: 'docker-compose.go.yml.hbs',
      laravel: 'docker-compose.laravel.yml.hbs',
    };
    const templateName = templateNames[framework];
    const templatePath = path.join(this.templatesDir, templateName);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = Handlebars.compile(templateContent);

    const composeContent = template({
      projectSlug,
      prNumber,
      appPort,
      dbPort,
    });

    const composeObj = yaml.load(composeContent) as Record<string, unknown>;
    const services = (composeObj.services ?? {}) as Record<string, unknown>;
    const app = (services.app ?? {}) as Record<string, unknown>;

    // Merge extra services (e.g. redis) into compose: add service block + app env + app depends_on
    for (const name of extraServices) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (name === 'redis') {
        (services as Record<string, unknown>).redis = await this.loadRedisServiceBlock(
          projectSlug,
          prNumber,
        );
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

    // Wire env and env_file from preview-config into app service (Heroku/Vercel-style runtime env)
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

    // Wire startup_commands: run inside container before main process (migrations, seeding, etc.)
    if (repoConfig?.startup_commands?.length) {
      const script = [...repoConfig.startup_commands, 'exec "$@"'].join(' && ');
      app.entrypoint = ['/bin/sh', '-c', script, '--'];
      app.command = this.getDefaultCommand(framework);
    }

    composeObj.services = services;
    const finalContent = yaml.dump(composeObj, { lineWidth: -1 });
    const composeFile = path.join(workDir, 'docker-compose.preview.yml');
    await fs.writeFile(composeFile, finalContent, 'utf-8');

    return composeFile;
  }

  /** Default CMD per framework (must match Dockerfile template). Used when startup_commands override entrypoint. */
  private getDefaultCommand(framework: TFramework): string[] {
    const commands: Record<TFramework, string[]> = {
      nestjs: ['node', 'dist/main'],
      go: ['./server'],
      laravel: ['php', 'artisan', 'serve', '--host=0.0.0.0', '--port=8000'],
    };
    return commands[framework];
  }

  /** Load Redis extra-service block from template (BullMQ etc.); app connects via network. */
  private async loadRedisServiceBlock(
    projectSlug: string,
    prNumber: number,
  ): Promise<Record<string, unknown>> {
    const templatePath = path.join(this.templatesDir, 'extra-service.redis.yml');
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = Handlebars.compile(templateContent);
    const rendered = template({ projectSlug, prNumber });
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return (yaml.load(rendered) as Record<string, unknown>) ?? {};
  }

  private async waitForHealthy(
    port: number,
    healthPath: string,
    maxAttempts: number,
  ): Promise<boolean> {
    const normalizedPath = healthPath.startsWith('/') ? healthPath : `/${healthPath}`;
    const healthUrl = `http://localhost:${port}${normalizedPath}`;
    const delay = 5000; // 5 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          this.logger.info({ port, attempt }, 'Health check passed');
          return true;
        }
      } catch (error: unknown) {
        // Ignore errors and retry
        this.logger.debug(
          { port, attempt, error: error instanceof Error ? error.message : 'Unknown error' },
          'Health check attempt failed',
        );
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    this.logger.warn({ port, maxAttempts }, 'Health check timeout');
    return false;
  }
}
