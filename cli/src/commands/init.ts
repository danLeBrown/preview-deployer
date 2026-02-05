import chalk from 'chalk';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as inquirer from 'inquirer';
import * as path from 'path';

import { Config, ConfigManager } from '../utils/config';

const REPO_FORMAT = /^[^/]+\/[^/]+$/;

function formatRepoList(repos: string[]): string {
  return repos.map((r, i) => `  ${i + 1}. ${r}`).join('\n');
}

interface InquirerAnswers {
  doToken: string;
  region: string;
  dropletSize: string;
  githubToken: string;
  cleanupTtlDays: string;
  maxConcurrentPreviews: string;
  alertEmail: string;
}

export async function initCommand(): Promise<void> {
  console.log(chalk.blue('Initializing Prvue configuration...\n'));

  const answersBeforeRepos = await inquirer.prompt<
    Pick<InquirerAnswers, 'doToken' | 'region' | 'dropletSize' | 'githubToken'>
  >([
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
  ]);

  const repositories: string[] = [];
  let reposConfirmed = false;
  while (!reposConfirmed) {
    let doneAdding = false;
    while (!doneAdding) {
      const message =
        repositories.length === 0
          ? 'GitHub repository (owner/repo):'
          : `GitHub repository (owner/repo), or press Enter when done (${repositories.length} added):`;
      const { repo } = await inquirer.prompt<{ repo: string }>([
        {
          type: 'input',
          name: 'repo',
          message,
          validate: (input: string) => {
            const trimmed = input.trim();
            if (trimmed === '') {
              if (repositories.length === 0) {
                return 'At least one repository is required';
              }
              return true;
            }
            if (!REPO_FORMAT.test(trimmed)) {
              return 'Use format owner/repo (e.g. myorg/myapp)';
            }
            return true;
          },
        },
      ]);
      const trimmed = repo.trim();
      if (trimmed === '') {
        doneAdding = true;
      } else {
        repositories.push(trimmed);
      }
    }

    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `Repositories to add:\n${formatRepoList(repositories)}\n\nProceed with these?`,
        default: true,
      },
    ]);
    if (confirmed) {
      reposConfirmed = true;
    }
  }

  const answersRest = await inquirer.prompt<
    Pick<InquirerAnswers, 'cleanupTtlDays' | 'maxConcurrentPreviews' | 'alertEmail'>
  >([
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
      token: answersBeforeRepos.doToken,
      region: answersBeforeRepos.region,
      droplet_size: answersBeforeRepos.dropletSize,
      alert_email: answersRest.alertEmail,
    },
    github: {
      token: answersBeforeRepos.githubToken,
      webhook_secret: webhookSecret,
      repositories,
    },
    orchestrator: {
      cleanup_ttl_days: parseInt(answersRest.cleanupTtlDays, 10) || 7,
      max_concurrent_previews: parseInt(answersRest.maxConcurrentPreviews, 10) || 10,
    },
  };

  await ConfigManager.saveConfig(config);
  console.log(chalk.green(`\nConfiguration saved to ${ConfigManager.getConfigPath()}`));

  // Write example preview-config from template (single source: templates/preview-config.example.yml)
  const templatePath = path.join(__dirname, '..', 'templates', 'preview-config.example.yml');
  const examplePath = path.join(process.cwd(), 'preview-config.example.yml');
  if (!fs.existsSync(examplePath)) {
    const exampleConfig = fs.readFileSync(templatePath, 'utf-8');
    fs.writeFileSync(examplePath, exampleConfig, 'utf-8');
    console.log(chalk.green(`Example config created: ${examplePath}`));
  }

  console.log(chalk.blue('\nNext steps:'));
  console.log('1. Review and customize preview-config.example.yml');
  console.log('2. Run: preview setup');
}
