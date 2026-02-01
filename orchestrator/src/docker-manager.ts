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
import { IPreviewConfig, TDatabaseType, TExtraService, TFramework } from './types/preview-config';

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

  async deployPreview(
    config: IPreviewConfig,
  ): Promise<{ url: string; appPort: number; framework: TFramework; dbType: TDatabaseType }> {
    const workDir = path.join(this.deploymentsDir, `pr-${config.prNumber}`);
    const { appPort, dbPort } = this.tracker.allocatePorts(config.prNumber);

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

      // Generate docker-compose file (base + extra services e.g. redis)
      const composeFile = await this.generateDockerCompose(
        config.prNumber,
        appPort,
        dbPort,
        framework,
        repoConfig?.extra_services ?? [],
        workDir,
      );

      this.logger.info({ prNumber: config.prNumber }, 'Building containers');
      await execAsync(`docker compose -f ${composeFile} up -d --build`, { cwd: workDir });

      // Wait for health check
      const isHealthy = await this.waitForHealthy(appPort, healthCheckPath, 60);
      if (!isHealthy) {
        throw new Error(`Health check failed for PR #${config.prNumber}`);
      }

      const url = `${process.env.PREVIEW_BASE_URL || 'http://localhost'}/pr-${config.prNumber}/`;
      this.logger.info({ prNumber: config.prNumber, url }, 'Preview deployed successfully');

      return { url, appPort, framework, dbType };
    } catch (error: unknown) {
      this.logger.error(
        {
          prNumber: config.prNumber,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to deploy preview',
      );
      // Cleanup on failure
      await this.cleanupPreview(config.prNumber).catch((cleanupError) => {
        this.logger.error(
          {
            prNumber: config.prNumber,
            error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
          },
          'Failed to cleanup after deployment failure',
        );
      });
      throw error;
    }
  }

  async updatePreview(prNumber: number, commitSha: string): Promise<void> {
    const workDir = path.join(this.deploymentsDir, `pr-${prNumber}`);
    const deployment = this.tracker.getDeployment(prNumber);

    if (!deployment) {
      throw new Error(`Deployment not found for PR #${prNumber}`);
    }

    try {
      // Pull latest changes
      await execAsync(`git fetch origin`, { cwd: workDir });
      await execAsync(`git reset --hard ${commitSha}`, { cwd: workDir });

      // Rebuild and restart containers
      const composeFile = path.join(workDir, 'docker-compose.preview.yml');
      await execAsync(`docker compose -f ${composeFile} up -d --build`, { cwd: workDir });

      // Wait for health check (use repo preview-config path if present)
      const repoConfig = await readRepoPreviewConfig(workDir);
      const healthCheckPath = repoConfig?.health_check_path ?? '/health';
      const isHealthy = await this.waitForHealthy(deployment.appPort, healthCheckPath, 60);
      if (!isHealthy) {
        throw new Error(`Health check failed after update for PR #${prNumber}`);
      }

      this.logger.info({ prNumber }, 'Preview updated successfully');
    } catch (error: unknown) {
      this.logger.error(
        { prNumber, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to update preview',
      );
      throw error;
    }
  }

  async cleanupPreview(prNumber: number): Promise<void> {
    const workDir = path.join(this.deploymentsDir, `pr-${prNumber}`);
    const composeFile = path.join(workDir, 'docker-compose.preview.yml');

    try {
      // Stop and remove containers
      try {
        await execAsync(`docker compose -f ${composeFile} down -v`, { cwd: workDir });
      } catch (error: unknown) {
        // Ignore if compose file doesn't exist
        this.logger.warn({ prNumber }, 'Docker compose file not found during cleanup');
      }

      // Remove working directory
      await fs.rm(workDir, { recursive: true, force: true });

      // Release ports
      await this.tracker.releasePorts(prNumber);

      this.logger.info({ prNumber }, 'Preview cleaned up successfully');
    } catch (error: unknown) {
      this.logger.error(
        { prNumber, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to cleanup preview',
      );
      throw error;
    }
  }

  async getPreviewStatus(prNumber: number): Promise<'running' | 'stopped' | 'failed'> {
    try {
      const containerName = `pr-${prNumber}-app`;
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
        { prNumber, error: error instanceof Error ? error.message : 'Unknown error' },
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
    prNumber: number,
    appPort: number,
    dbPort: number,
    framework: TFramework,
    extraServices: TExtraService[],
    workDir: string,
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

    let composeContent = template({
      prNumber,
      appPort,
      dbPort,
    });

    // Merge extra services (e.g. redis) into compose: add service block + app env + app depends_on
    if (extraServices.length > 0) {
      const composeObj = yaml.load(composeContent) as Record<string, unknown>;
      const services = (composeObj.services ?? {}) as Record<string, unknown>;
      const app = (services.app ?? {}) as Record<string, unknown>;

      for (const name of extraServices) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (name === 'redis') {
          (services as Record<string, unknown>).redis = await this.loadRedisServiceBlock(prNumber);
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          const env = (app.environment as string[]) ?? [];
          if (!env.some((e) => e.startsWith('REDIS_URL='))) {
            app.environment = [...env, 'REDIS_URL=redis://redis:6379'];
          }
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          const dependsOn = (app.depends_on as Record<string, unknown>) ?? {};
          (dependsOn as Record<string, unknown>).redis = {};
          app.depends_on = dependsOn;
        }
      }
      composeObj.services = services;
      composeContent = yaml.dump(composeObj, { lineWidth: -1 });
    }

    const composeFile = path.join(workDir, 'docker-compose.preview.yml');
    await fs.writeFile(composeFile, composeContent, 'utf-8');

    return composeFile;
  }

  /** Load Redis extra-service block from template (BullMQ etc.); app connects via network. */
  private async loadRedisServiceBlock(prNumber: number): Promise<Record<string, unknown>> {
    const templatePath = path.join(this.templatesDir, 'extra-service.redis.yml');
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = Handlebars.compile(templateContent);
    const rendered = template({ prNumber });
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
