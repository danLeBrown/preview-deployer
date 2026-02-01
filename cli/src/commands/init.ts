import chalk from 'chalk';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as inquirer from 'inquirer';
import * as path from 'path';

import { Config, ConfigManager } from '../utils/config';

interface InquirerAnswers {
  doToken: string;
  region: string;
  dropletSize: string;
  githubToken: string;
  repositories: string;
  cleanupTtlDays: string;
  maxConcurrentPreviews: string;
  alertEmail: string;
}

export async function initCommand(): Promise<void> {
  console.log(chalk.blue('Initializing preview-deployer configuration...\n'));

  const answers = await inquirer.prompt<InquirerAnswers>([
    {
      type: 'password',
      name: 'doToken',
      message: 'Digital Ocean API token:',
      validate: (input: string) => input.length > 0 || 'Token is required',
    },
    {
      type: 'input',
      name: 'region',
      message: 'Digital Ocean region:',
      default: 'nyc3',
    },
    {
      type: 'list',
      name: 'dropletSize',
      message: 'Droplet size:',
      choices: [
        { name: 's-1vcpu-1gb ($6/month)', value: 's-1vcpu-1gb' },
        { name: 's-1vcpu-2gb ($12/month)', value: 's-1vcpu-2gb' },
        { name: 's-2vcpu-2gb ($18/month)', value: 's-2vcpu-2gb' },
        { name: 's-2vcpu-4gb ($24/month)', value: 's-2vcpu-4gb' },
        { name: 's-4vcpu-8gb ($48/month)', value: 's-4vcpu-8gb' },
      ],
      default: 's-1vcpu-2gb',
    },
    {
      type: 'password',
      name: 'githubToken',
      message: 'GitHub personal access token:',
      validate: (input: string) => input.length > 0 || 'Token is required',
    },
    {
      type: 'input',
      name: 'repositories',
      message: 'GitHub repositories (comma-separated, format: owner/repo):',
      validate: (input: string) => {
        const repos = input.split(',').map((r) => r.trim());
        return repos.length > 0 || 'At least one repository is required';
      },
    },
    {
      type: 'input',
      name: 'cleanupTtlDays',
      message: 'Cleanup TTL (days):',
      default: '7',
      validate: (input: string) => {
        const days = parseInt(input, 10);
        return (!isNaN(days) && days > 0) || 'Must be a positive number';
      },
    },
    {
      type: 'input',
      name: 'maxConcurrentPreviews',
      message: 'Max concurrent previews:',
      default: '10',
      validate: (input: string) => {
        const max = parseInt(input, 10);
        return (!isNaN(max) && max > 0) || 'Must be a positive number';
      },
    },
    {
      type: 'input',
      name: 'alertEmail',
      message: 'Alert email:',
      default: 'ayomidedaniel00@gmail.com',
    },
  ]);

  // Generate webhook secret
  const webhookSecret = crypto.randomBytes(32).toString('hex');

  const config: Config = {
    digitalocean: {
      token: answers.doToken,
      region: answers.region,
      droplet_size: answers.dropletSize,
      alert_email: answers.alertEmail,
    },
    github: {
      token: answers.githubToken,
      webhook_secret: webhookSecret,
      repositories: answers.repositories.split(',').map((r: string) => r.trim()),
    },
    orchestrator: {
      cleanup_ttl_days: parseInt(answers.cleanupTtlDays, 10) || 7,
      max_concurrent_previews: parseInt(answers.maxConcurrentPreviews, 10) || 10,
    },
  };

  await ConfigManager.saveConfig(config);
  console.log(chalk.green(`\nConfiguration saved to ${ConfigManager.getConfigPath()}`));

  // Create example preview-config.yml
  const exampleConfig = `# Preview Deployer Configuration
# Place this file in your repository root as preview-config.yml

framework: nestjs  # Options: nestjs, go, laravel (overrides auto-detection)
database: postgres  # Options: postgres, mysql, mongodb
health_check_path: /health  # Health check endpoint path

# Optional: Commands run on the host before docker compose (e.g. copy .env)
# build_commands:
#   - cp .env.example .env

# Optional: Extra infra (e.g. Redis for BullMQ). App gets REDIS_URL=redis://redis:6379
# extra_services:
#   - redis

# Optional: Environment variables (passed to application container)
# env:
#   - NODE_ENV=preview
`;

  const examplePath = path.join(process.cwd(), 'preview-config.example.yml');
  if (!fs.existsSync(examplePath)) {
    fs.writeFileSync(examplePath, exampleConfig, 'utf-8');
    console.log(chalk.green(`Example config created: ${examplePath}`));
  }

  console.log(chalk.blue('\nNext steps:'));
  console.log('1. Review and customize preview-config.example.yml');
  console.log('2. Run: preview setup');
}
