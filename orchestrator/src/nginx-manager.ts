import { exec } from 'child_process';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as Handlebars from 'handlebars';
import * as path from 'path';
import { Logger } from 'pino';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class NginxManager {
  private configDir: string;
  private template!: HandlebarsTemplateDelegate;
  private logger: Logger;

  constructor(configDir: string, logger: Logger) {
    this.configDir = configDir;
    this.logger = logger;
    this.loadTemplate();
  }

  private loadTemplate(): void {
    const templatePath = path.join(__dirname, '../templates/nginx-preview.conf.hbs');
    const templateContent = fsSync.readFileSync(templatePath, 'utf-8');
    this.template = Handlebars.compile(templateContent);
  }

  async addPreview(prNumber: number, appPort: number): Promise<void> {
    const configPath = path.join(this.configDir, `pr-${prNumber}.conf`);
    const config = this.generateNginxConfig(prNumber, appPort);

    try {
      await fs.writeFile(configPath, config, { mode: 0o644 });
      this.logger.info({ prNumber, appPort, configPath }, 'Created nginx config');
      await this.reloadNginx();
    } catch (error: unknown) {
      this.logger.error(
        { prNumber, appPort, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to add nginx preview config',
      );
      throw error;
    }
  }

  async removePreview(prNumber: number): Promise<void> {
    const configPath = path.join(this.configDir, `pr-${prNumber}.conf`);

    try {
      await fs.unlink(configPath);
      this.logger.info({ prNumber, configPath }, 'Removed nginx config');
      await this.reloadNginx();
    } catch (error: unknown) {
      // Ignore error if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error(
          { prNumber, error: error instanceof Error ? error.message : 'Unknown error' },
          'Failed to remove nginx config',
        );
        throw error;
      }
      this.logger.warn({ prNumber }, 'Nginx config file not found, skipping removal');
    }
  }

  private generateNginxConfig(prNumber: number, appPort: number): string {
    return this.template({
      prNumber,
      appPort,
    });
  }

  private async reloadNginx(): Promise<void> {
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
