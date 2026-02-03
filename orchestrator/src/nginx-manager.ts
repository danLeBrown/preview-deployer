import { exec } from 'child_process';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as Handlebars from 'handlebars';
import * as path from 'path';
import { Logger } from 'pino';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Optional reload command; if provided, used instead of real nginx reload (e.g. no-op in tests). */
export type NginxReloadCommand = () => Promise<void>;

export interface NginxManagerOptions {
  /** If provided, called after add/remove config instead of running sudo nginx -t / nginx -s reload. */
  reloadCommand?: NginxReloadCommand | null;
}

export class NginxManager {
  private configDir: string;
  private template!: HandlebarsTemplateDelegate;
  private logger: Logger;
  private reloadCommand: NginxReloadCommand | null;

  constructor(configDir: string, logger: Logger, options: NginxManagerOptions = {}) {
    this.configDir = configDir;
    this.logger = logger;
    this.reloadCommand = options.reloadCommand ?? null;
    this.loadTemplate();
  }

  private loadTemplate(): void {
    const templatePath = path.join(__dirname, '../templates/nginx-preview.conf.hbs');
    const templateContent = fsSync.readFileSync(templatePath, 'utf-8');
    this.template = Handlebars.compile(templateContent);
  }

  async addPreview(projectSlug: string, prNumber: number, appPort: number): Promise<void> {
    const configFileName = `${projectSlug}-pr-${prNumber}.conf`;
    const configPath = path.join(this.configDir, configFileName);
    const config = this.generateNginxConfig(projectSlug, prNumber, appPort);

    try {
      await fs.writeFile(configPath, config, { mode: 0o644 });
      this.logger.info({ projectSlug, prNumber, appPort, configPath }, 'Created nginx config');
      await this.reloadNginx();
    } catch (error: unknown) {
      this.logger.error(
        {
          projectSlug,
          prNumber,
          appPort,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to add nginx preview config',
      );
      throw error;
    }
  }

  async removePreview(projectSlug: string, prNumber: number): Promise<void> {
    const configFileName = `${projectSlug}-pr-${prNumber}.conf`;
    const configPath = path.join(this.configDir, configFileName);

    try {
      await fs.unlink(configPath);
      this.logger.info({ projectSlug, prNumber, configPath }, 'Removed nginx config');
      await this.reloadNginx();
    } catch (error: unknown) {
      // Ignore error if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error(
          {
            projectSlug,
            prNumber,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to remove nginx config',
        );
        throw error;
      }
      this.logger.warn({ projectSlug, prNumber }, 'Nginx config file not found, skipping removal');
    }
  }

  private generateNginxConfig(projectSlug: string, prNumber: number, appPort: number): string {
    return this.template({
      projectSlug,
      prNumber,
      appPort,
    });
  }

  private async reloadNginx(): Promise<void> {
    if (this.reloadCommand) {
      await this.reloadCommand();
      return;
    }
    try {
      // Validate config first
      const { stdout: testOutput } = await execAsync('sudo nginx -t');
      this.logger.debug({ testOutput }, 'Nginx config test passed');

      // Reload nginx
      await execAsync('sudo nginx -s reload');
      this.logger.info('Nginx reloaded successfully');
    } catch (error: unknown) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stderr: (error as Record<string, unknown>).stderr,
        },
        'Failed to reload nginx',
      );
      throw new Error(
        `Nginx reload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
