import { exec } from 'child_process';
import Docker, { ContainerInspectInfo } from 'dockerode';
import * as fs from 'fs/promises';
import * as Handlebars from 'handlebars';
import * as path from 'path';
import { Logger } from 'pino';
import { promisify } from 'util';

import { IDeploymentTracker } from './types/deployment';
import { IPreviewConfig, TFramework } from './types/preview-config';

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

  async deployPreview(config: IPreviewConfig): Promise<{ url: string; appPort: number }> {
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

      // Detect framework
      const framework = await this.detectFramework(workDir);
      this.logger.info({ prNumber: config.prNumber, framework }, 'Detected framework');

      // Generate docker-compose file
      const composeFile = await this.generateDockerCompose(
        config.prNumber,
        appPort,
        dbPort,
        framework,
        workDir,
      );

      // Build and start containers
      this.logger.info({ prNumber: config.prNumber }, 'Building containers');
      await execAsync(`docker compose -f ${composeFile} up -d --build`, { cwd: workDir });

      // Wait for health check
      const isHealthy = await this.waitForHealthy(appPort, 60);
      if (!isHealthy) {
        throw new Error(`Health check failed for PR #${config.prNumber}`);
      }

      const url = `${process.env.PREVIEW_BASE_URL || 'http://localhost'}/pr-${config.prNumber}/`;
      this.logger.info({ prNumber: config.prNumber, url }, 'Preview deployed successfully');

      return { url, appPort };
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

      // Wait for health check
      const isHealthy = await this.waitForHealthy(deployment.appPort, 60);
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
    ``;
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

  private async detectFramework(workDir: string): Promise<TFramework> {
    try {
      // Check for NestJS
      const nestCliPath = path.join(workDir, 'nest-cli.json');
      const packageJsonPath = path.join(workDir, 'package.json');

      try {
        await fs.access(nestCliPath);
        return 'nestjs';
      } catch {
        // Check package.json for NestJS
        try {
          const packageJson = JSON.parse(
            await fs.readFile(packageJsonPath, 'utf-8'),
          ) as unknown as {
            dependencies: Record<string, string>;
            devDependencies: Record<string, string>;
          };
          if (
            packageJson.dependencies['@nestjs/core'] ||
            packageJson.devDependencies['@nestjs/core']
          ) {
            return 'nestjs';
          }
        } catch {
          // Continue to Go check
        }
      }

      // Check for Go
      const goModPath = path.join(workDir, 'go.mod');
      try {
        await fs.access(goModPath);
        return 'go';
      } catch {
        // Default to NestJS if detection fails
        this.logger.warn({ workDir }, 'Framework detection failed, defaulting to NestJS');
        return 'nestjs';
      }
    } catch (error: unknown) {
      this.logger.error(
        { workDir, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to detect framework',
      );
      return 'nestjs'; // Default
    }
  }

  private async generateDockerCompose(
    prNumber: number,
    appPort: number,
    dbPort: number,
    framework: TFramework,
    workDir: string,
  ): Promise<string> {
    const templateName =
      framework === 'nestjs' ? 'docker-compose.nestjs.yml.hbs' : 'docker-compose.go.yml.hbs';
    const templatePath = path.join(this.templatesDir, templateName);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = Handlebars.compile(templateContent);

    const composeContent = template({
      prNumber,
      appPort,
      dbPort,
    });

    const composeFile = path.join(workDir, 'docker-compose.preview.yml');
    await fs.writeFile(composeFile, composeContent, 'utf-8');

    return composeFile;
  }

  private async waitForHealthy(port: number, maxAttempts: number): Promise<boolean> {
    const healthUrl = `http://localhost:${port}/health`;
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
