import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

export interface TerraformOutput {
  server_ip: { value: string };
  droplet_id: { value: string };
  server_ssh_user: { value: string };
  reserved_ip: { value: string };
}

export class TerraformWrapper {
  private terraformDir: string;

  constructor(terraformDir: string) {
    this.terraformDir = terraformDir;
  }

  async init(): Promise<void> {
    console.log(chalk.blue('Initializing Terraform...'));
    try {
      const { stdout } = await execAsync('terraform init', { cwd: this.terraformDir });
      console.log(stdout);
    } catch (error: any) {
      console.error(chalk.red('Terraform init failed:'), error.message);
      throw error;
    }
  }

  async plan(variables: Record<string, string>): Promise<string> {
    console.log(chalk.blue('Planning Terraform changes...'));
    const varArgs = Object.entries(variables)
      .map(([key, value]) => `-var="${key}=${value}"`)
      .join(' ');

    try {
      const { stdout } = await execAsync(`terraform plan ${varArgs}`, {
        cwd: this.terraformDir,
      });
      return stdout;
    } catch (error: any) {
      console.error(chalk.red('Terraform plan failed:'), error.message);
      throw error;
    }
  }

  async apply(variables: Record<string, string>, autoApprove: boolean = false): Promise<void> {
    console.log(chalk.blue('Applying Terraform changes...'));
    const varArgs = Object.entries(variables)
      .map(([key, value]) => `-var="${key}=${value}"`)
      .join(' ');
    const approveFlag = autoApprove ? '-auto-approve' : '';

    try {
      const { stdout } = await execAsync(`terraform apply ${approveFlag} ${varArgs}`, {
        cwd: this.terraformDir,
      });
      console.log(stdout);
    } catch (error: any) {
      console.error(chalk.red('Terraform apply failed:'), error.message);
      throw error;
    }
  }

  async destroy(variables: Record<string, string>, autoApprove: boolean = false): Promise<void> {
    console.log(chalk.yellow('Destroying Terraform infrastructure...'));
    const varArgs = Object.entries(variables)
      .map(([key, value]) => `-var="${key}=${value}"`)
      .join(' ');
    const approveFlag = autoApprove ? '-auto-approve' : '';

    try {
      const { stdout } = await execAsync(`terraform destroy ${approveFlag} ${varArgs}`, {
        cwd: this.terraformDir,
      });
      console.log(stdout);
    } catch (error: any) {
      console.error(chalk.red('Terraform destroy failed:'), error.message);
      throw error;
    }
  }

  async getOutputs(): Promise<TerraformOutput> {
    try {
      const { stdout } = await execAsync('terraform output -json', {
        cwd: this.terraformDir,
      });
      return JSON.parse(stdout) as TerraformOutput;
    } catch (error: any) {
      console.error(chalk.red('Failed to get Terraform outputs:'), error.message);
      throw error;
    }
  }

  async waitForDropletReady(ip: string, maxAttempts: number = 30): Promise<void> {
    console.log(chalk.blue(`Waiting for droplet to be ready (${ip})...`));
    const delay = 5000; // 5 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { stdout } = await execAsync(`ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no root@${ip} "echo ready"`);
        if (stdout.trim() === 'ready') {
          console.log(chalk.green('Droplet is ready!'));
          return;
        }
      } catch {
        // Continue waiting
      }

      if (attempt < maxAttempts) {
        process.stdout.write('.');
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error('Droplet did not become ready in time');
  }
}
