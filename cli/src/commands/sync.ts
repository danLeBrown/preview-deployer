import chalk from 'chalk';
import * as dotenv from 'dotenv';
import * as path from 'path';

import { AnsibleWrapper } from '../utils/ansible';
import { ConfigManager } from '../utils/config';
import { TerraformWrapper } from '../utils/terraform';

export async function syncCommand(): Promise<void> {
  console.log(chalk.blue('Syncing orchestrator code to server...\n'));

  const envPath = process.env.PREVIEW_ENV_PATH ?? path.resolve(__dirname, '..', '..', '.env');
  dotenv.config({ path: envPath });

  const config = await ConfigManager.loadConfig();
  if (!config) {
    console.error(chalk.red('Configuration not found. Run "preview init" first.'));
    process.exit(1);
  }

  const terraformDir = path.join(process.cwd(), 'terraform');
  const ansibleDir = path.join(process.cwd(), 'ansible');
  const terraform = new TerraformWrapper(terraformDir);
  const ansible = new AnsibleWrapper(ansibleDir, terraformDir);

  try {
    const outputs = await terraform.getOutputs();
    if (Object.keys(outputs).length === 0) {
      console.error(chalk.red('Terraform outputs not found. Run "preview setup" first.'));
      process.exit(1);
    }

    const serverIp = outputs.server_ip.value;
    const sshKeyPath = process.env.PREVIEW_SSH_KEY_PATH;

    if (!sshKeyPath) {
      console.error(chalk.red('SSH key path not found. Run "preview setup" first.'));
      process.exit(1);
    }

    console.log(chalk.blue(`Server: ${serverIp}`));
    console.log(chalk.blue(`SSH key: ${sshKeyPath}\n`));

    const inventoryPath = await ansible.generateInventory(serverIp, sshKeyPath);
    await ansible.runPlaybook(inventoryPath, {}, 'sync-orchestrator.yml');

    console.log(chalk.green('\nSync complete. Orchestrator has been restarted.'));
  } catch (error: unknown) {
    console.error(
      chalk.red(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
    );
    process.exit(1);
  }
}
