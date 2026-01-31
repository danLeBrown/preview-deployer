import chalk from 'chalk';
import * as path from 'path';

import { ConfigManager } from '../utils/config';
import { TerraformWrapper } from '../utils/terraform';

export async function statusCommand(): Promise<void> {
  console.log(chalk.blue('Checking preview-deployer status...\n'));

  const config = await ConfigManager.loadConfig();
  if (!config) {
    console.error(chalk.red('Configuration not found. Run "preview init" first.'));
    process.exit(1);
  }

  const terraformDir = path.join(process.cwd(), 'terraform');
  const terraform = new TerraformWrapper(terraformDir);

  try {
    const outputs = await terraform.getOutputs();
    console.log(JSON.stringify(outputs));

    if (Object.keys(outputs).length === 0) {
      console.log(chalk.yellow('Terraform outputs not found. Run "preview init" first.'));
      process.exit(1);
    }

    const serverIp = outputs.server_ip.value;

    console.log(chalk.green('Infrastructure Status:'));
    console.log(`  Server IP: ${serverIp}`);
    console.log(`  Droplet ID: ${outputs.droplet_id.value}`);

    // Check orchestrator API
    try {
      const response = await fetch(`http://${serverIp}:3000/health`);
      if (response.ok) {
        const health = (await response.json()) as { status: string; uptime: number };
        console.log(chalk.green('\nOrchestrator Status:'));
        console.log(`  Status: ${health.status}`);
        console.log(`  Uptime: ${Math.floor(health.uptime / 60)} minutes`);

        // Get active previews
        const previewsResponse = await fetch(`http://${serverIp}:3000/api/previews`);
        if (previewsResponse.ok) {
          const previews = (await previewsResponse.json()) as {
            deployments: Array<{ prNumber: number; url?: string }>;
          };
          console.log(chalk.green(`\nActive Previews: ${previews.deployments.length}`));
          if (previews.deployments.length > 0) {
            previews.deployments.forEach((deployment) => {
              console.log(`  PR #${deployment.prNumber}: ${deployment.url || 'building'}`);
            });
          }
        }
      }
    } catch (error: unknown) {
      console.log(chalk.yellow('\nOrchestrator Status:'));
      console.log(
        `  Unable to connect: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  } catch (error: unknown) {
    console.error(
      chalk.red(
        `Failed to get status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ),
    );
    console.log(chalk.yellow('Make sure Terraform has been applied.'));
    process.exit(1);
  }
}
