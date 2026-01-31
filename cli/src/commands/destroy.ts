import chalk from 'chalk';
import * as inquirer from 'inquirer';
import * as path from 'path';

import { ConfigManager } from '../utils/config';
import { GitHubWebhookManager } from '../utils/github';
import { TerraformWrapper } from '../utils/terraform';

export async function destroyCommand(): Promise<void> {
  console.log(chalk.red('⚠️  This will destroy all infrastructure and preview deployments!\n'));

  const config = await ConfigManager.loadConfig();
  if (!config) {
    console.error(chalk.red('Configuration not found.'));
    process.exit(1);
  }

  const confirmAnswer = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to destroy all infrastructure? This cannot be undone!',
      default: false,
    },
  ]);

  if (!confirmAnswer.confirm) {
    console.log(chalk.yellow('Destroy cancelled.'));
    return;
  }

  const terraformDir = path.join(process.cwd(), 'terraform');
  const terraform = new TerraformWrapper(terraformDir);
  const github = new GitHubWebhookManager(config.github.token);

  try {
    // Get server IP for cleanup
    let serverIp: string | null = null;
    try {
      const outputs = await terraform.getOutputs();
      serverIp = outputs.server_ip.value;

      // Cleanup previews via orchestrator API
      if (serverIp) {
        try {
          const previewsResponse = await fetch(`http://${serverIp}:3000/api/previews`);
          if (previewsResponse.ok) {
            const previews = (await previewsResponse.json()) as {
              deployments: Array<{ prNumber: number }>;
            };
            console.log(
              chalk.blue(`Cleaning up ${previews.deployments.length} preview deployments...`),
            );
            for (const deployment of previews.deployments) {
              try {
                await fetch(`http://${serverIp}:3000/api/previews/${deployment.prNumber}`, {
                  method: 'DELETE',
                });
              } catch (error: unknown) {
                // Ignore cleanup errors
              }
            }
          }
        } catch (error: unknown) {
          // Ignore if orchestrator is not available
        }
      }
    } catch (error: unknown) {
      // Terraform outputs not available, skip cleanup
    }

    // Delete GitHub webhooks
    console.log(chalk.blue('\nDeleting GitHub webhooks...'));
    for (const repo of config.github.repositories) {
      const [owner, repoName] = repo.split('/');
      try {
        const hooks = await github.listWebhooks(owner, repoName);
        const webhookUrl = serverIp ? `http://${serverIp}/webhook/github` : '';
        const hook = hooks.find((h) => h.config.url === webhookUrl);
        if (hook) {
          await github.deleteWebhook(owner, repoName, hook.id);
        }
      } catch (error: unknown) {
        console.log(
          chalk.yellow(
            `Failed to delete webhook for ${repo}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ),
        );
      }
    }

    // Destroy Terraform
    console.log(chalk.blue('\nDestroying Terraform infrastructure...'));
    const terraformVars = {
      do_token: config.digitalocean.token,
      ssh_public_key: 'dummy', // Not needed for destroy
      region: config.digitalocean.region,
      droplet_size: config.digitalocean.droplet_size,
      project_name: 'preview-deployer',
      alert_email: config.digitalocean.alert_email,
    };

    const destroyConfirm = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Confirm Terraform destroy?',
        default: false,
      },
    ]);

    if (destroyConfirm.confirm) {
      await terraform.destroy(terraformVars, true);
      console.log(chalk.green('\n✅ Infrastructure destroyed successfully!'));
    } else {
      console.log(chalk.yellow('Destroy cancelled.'));
    }
  } catch (error: unknown) {
    console.error(
      chalk.red(`Destroy failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
    );
    process.exit(1);
  }
}
