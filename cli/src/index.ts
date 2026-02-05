#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';

import { destroyCommand } from './commands/destroy';
import { initCommand } from './commands/init';
import { setupCommand } from './commands/setup';
import { statusCommand } from './commands/status';
import { syncCommand } from './commands/sync';

const program = new Command();

program
  .name('preview')
  .description('Prvue CLI - Automated preview deployment system')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize Prvue configuration')
  .action(async () => {
    try {
      await initCommand();
    } catch (error: unknown) {
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      );
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Set up infrastructure and deploy orchestrator')
  .action(async () => {
    try {
      await setupCommand();
    } catch (error: unknown) {
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      );
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check deployment status')
  .action(async () => {
    try {
      await statusCommand();
    } catch (error: unknown) {
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      );
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Sync orchestrator code to server (build, rsync, restart)')
  .action(async () => {
    try {
      await syncCommand();
    } catch (error: unknown) {
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      );
      process.exit(1);
    }
  });

program
  .command('destroy')
  .description('Destroy all infrastructure and cleanup')
  .action(async () => {
    try {
      await destroyCommand();
    } catch (error: unknown) {
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`),
      );
      process.exit(1);
    }
  });

program.parse();
