#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { setupCommand } from './commands/setup';
import { statusCommand } from './commands/status';
import { destroyCommand } from './commands/destroy';

const program = new Command();

program
  .name('preview')
  .description('Preview Deployer CLI - Automated preview deployment system')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize preview-deployer configuration')
  .action(async () => {
    try {
      await initCommand();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Set up infrastructure and deploy orchestrator')
  .action(async () => {
    try {
      await setupCommand();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check deployment status')
  .action(async () => {
    try {
      await statusCommand();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('destroy')
  .description('Destroy all infrastructure and cleanup')
  .action(async () => {
    try {
      await destroyCommand();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program.parse();
