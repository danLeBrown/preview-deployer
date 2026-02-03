import chalk from 'chalk';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class AnsibleWrapper {
  private ansibleDir: string;

  constructor(ansibleDir: string, _terraformDir: string) {
    this.ansibleDir = ansibleDir;
  }

  async generateInventory(serverIp: string, sshKeyPath?: string): Promise<string> {
    const inventoryPath = path.join(this.ansibleDir, 'inventory.ini');
    const keyArg = sshKeyPath ? ` ansible_ssh_private_key_file=${sshKeyPath}` : '';
    const inventoryContent = `[preview_deployer]
${serverIp} ansible_user=root${keyArg}
`;

    fs.writeFileSync(inventoryPath, inventoryContent, 'utf-8');
    return Promise.resolve(inventoryPath);
  }

  async runPlaybook(
    inventoryPath: string,
    extraVars: Record<string, string>,
    playbookFile = 'playbook.yml',
  ): Promise<void> {
    console.log(chalk.blue(`Running Ansible playbook (${playbookFile})...`));

    const varArgs = Object.entries(extraVars)
      .map(([key, value]) => `-e "${key}=${value}"`)
      .join(' ');

    const cmd = `ansible-playbook -i ${inventoryPath} ${playbookFile}${varArgs ? ` ${varArgs}` : ''}`;
    console.log(cmd);

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: this.ansibleDir,
      });

      if (stdout) {
        console.log(stdout);
      }
      if (stderr) {
        console.error(chalk.yellow(stderr));
      }
    } catch (error: unknown) {
      console.error(
        chalk.red('Ansible playbook failed:'),
        error instanceof Error ? error.message : 'Unknown error',
      );
      if (
        'stderr' in (error as Record<string, unknown>) &&
        typeof (error as Record<string, unknown>).stderr === 'string'
      ) {
        console.error(chalk.red('Ansible stderr:'), (error as Record<string, unknown>).stderr);
      }
      throw error;
    }
  }
}
