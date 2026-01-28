import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

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
    return inventoryPath;
  }

  async runPlaybook(
    inventoryPath: string,
    extraVars: Record<string, string>
  ): Promise<void> {
    console.log(chalk.blue('Running Ansible playbook...'));

    const varArgs = Object.entries(extraVars)
      .map(([key, value]) => `-e "${key}=${value}"`)
      .join(' ');

    try {
      const { stdout, stderr } = await execAsync(
        `ansible-playbook -i ${inventoryPath} playbook.yml ${varArgs}`,
        {
          cwd: this.ansibleDir,
        }
      );

      if (stdout) {
        console.log(stdout);
      }
      if (stderr) {
        console.error(chalk.yellow(stderr));
      }
    } catch (error: any) {
      console.error(chalk.red('Ansible playbook failed:'), error.message);
      if (error.stderr) {
        console.error(chalk.red('Ansible stderr:'), error.stderr);
      }
      throw error;
    }
  }
}
