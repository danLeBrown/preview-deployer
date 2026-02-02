import chalk from 'chalk';
import * as fs from 'fs';
import * as inquirer from 'inquirer';
import * as os from 'os';
import * as path from 'path';

import { AnsibleWrapper } from '../utils/ansible';
import { ConfigManager } from '../utils/config';
import { GitHubWebhookManager } from '../utils/github';
import { TerraformWrapper } from '../utils/terraform';

export async function setupCommand(): Promise<void> {
  console.log(chalk.blue('Setting up preview-deployer infrastructure...\n'));

  const config = await ConfigManager.loadConfig();
  if (!config) {
    console.error(chalk.red('Configuration not found. Run "preview init" first.'));
    process.exit(1);
  }

  const errors = ConfigManager.validateConfig(config);
  if (errors.length > 0) {
    console.error(chalk.red('Configuration errors:'));
    errors.forEach((error) => console.error(chalk.red(`  - ${error}`)));
    process.exit(1);
  }

  // Get SSH public key
  const sshKeyAnswers = await inquirer.prompt<{ sshPublicKey: string; sshPrivateKeyPath: string }>([
    {
      type: 'input',
      name: 'sshPublicKey',
      message: 'SSH public key path (or paste key):',
      // default: '~/.ssh/id_rsa.pub',
      default: '~/.ssh/digital_ocean_ed25519.pub',
      validate: (input: string) => {
        if (input.startsWith('ssh-')) {
          return true; // Pasted key
        }
        const keyPath = input.replace('~', os.homedir());
        return fs.existsSync(keyPath) || 'SSH key file not found';
      },
    },
    {
      type: 'input',
      name: 'sshPrivateKeyPath',
      message: 'SSH private key path (or paste key):',
      default: '~/.ssh/digital_ocean_ed25519',
      validate: (input: string) => {
        if (input.startsWith('ssh-')) {
          return 'Only the path to the key file is allowed';
        }
        const keyPath = input.replace('~', os.homedir());
        return fs.existsSync(keyPath) || `SSH key file not found: ${keyPath}`;
      },
    },
  ]);

  let sshPublicKey: string;
  if (sshKeyAnswers.sshPublicKey.startsWith('ssh-')) {
    sshPublicKey = sshKeyAnswers.sshPublicKey;
  } else {
    const keyPath = sshKeyAnswers.sshPublicKey.replace('~', os.homedir());
    sshPublicKey = fs.readFileSync(keyPath, 'utf-8').trim();
  }

  const sshPrivateKeyPath = sshKeyAnswers.sshPrivateKeyPath;

  // Confirm Terraform apply
  const confirmAnswer = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'This will create infrastructure on Digital Ocean. Continue?',
      default: false,
    },
  ]);

  if (!confirmAnswer.confirm) {
    console.log(chalk.yellow('Setup cancelled.'));
    return;
  }

  const terraformDir = path.join(process.cwd(), 'terraform');
  const ansibleDir = path.join(process.cwd(), 'ansible');

  const terraform = new TerraformWrapper(terraformDir);
  const ansible = new AnsibleWrapper(ansibleDir, terraformDir);

  try {
    // Initialize Terraform
    await terraform.init();

    // Plan Terraform
    const terraformVars = {
      do_token: config.digitalocean.token,
      ssh_public_key: sshPublicKey,
      region: config.digitalocean.region,
      droplet_size: config.digitalocean.droplet_size,
      project_name: 'preview-deployer',
      alert_email: config.digitalocean.alert_email,
    };

    console.log(chalk.blue('\nTerraform plan:'));
    await terraform.plan(terraformVars);

    const applyConfirm = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Apply Terraform changes?',
        default: false,
      },
    ]);

    if (!applyConfirm.confirm) {
      console.log(chalk.yellow('Setup cancelled.'));
      return;
    }

    // Apply Terraform
    await terraform.apply(terraformVars, true);

    // Get outputs
    const outputs = await terraform.getOutputs();
    const serverIp = outputs.reserved_ip.value;

    console.log(chalk.green(`\nDroplet created: ${serverIp}`));

    // Wait for droplet to be ready
    await terraform.waitForDropletReady(sshPrivateKeyPath, serverIp);

    // Run Ansible
    const inventoryPath = await ansible.generateInventory(serverIp, sshPrivateKeyPath);
    const ansibleVars = {
      github_token: config.github.token,
      github_webhook_secret: config.github.webhook_secret,
      allowed_repos: config.github.repositories.join(','),
      server_ip: serverIp,
      preview_base_url: `http://${serverIp}`,
      cleanup_ttl_days: config.orchestrator.cleanup_ttl_days.toString(),
      max_concurrent_previews: config.orchestrator.max_concurrent_previews.toString(),
    };

    await ansible.runPlaybook(inventoryPath, ansibleVars);

    // Create GitHub webhooks
    const github = new GitHubWebhookManager(config.github.token);
    const webhookUrl = `http://${serverIp}/webhook/github`;

    console.log(chalk.blue('\nCreating GitHub webhooks...'));
    for (const repo of config.github.repositories) {
      const [owner, repoName] = repo.split('/');
      await github.createWebhook(owner, repoName, webhookUrl, config.github.webhook_secret);
    }

    // Summary
    console.log(chalk.green('\n✅ Setup complete!\n'));
    console.log(chalk.blue('Summary:'));
    console.log(`  Server IP: ${serverIp}`);
    console.log(`  Orchestrator API: http://${serverIp}:3000`);
    console.log(`  Webhook URL: ${webhookUrl}`);
    console.log(`  Repositories: ${config.github.repositories.join(', ')}`);
    console.log(chalk.blue('\nNext steps:'));
    console.log('1. Create a PR in one of your repositories');
    console.log('2. Check the PR comments for the preview URL');
    console.log('3. Run "preview status" to see active deployments');
  } catch (error: unknown) {
    console.error(
      chalk.red(`\nSetup failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
    );
    process.exit(1);
  }
}
