import { Octokit } from '@octokit/rest';
import chalk from 'chalk';

export class GitHubWebhookManager {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async createWebhook(
    owner: string,
    repo: string,
    webhookUrl: string,
    secret: string
  ): Promise<number> {
    try {
      const response = await this.octokit.rest.repos.createWebhook({
        owner,
        repo,
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret,
          insecure_ssl: '0',
        },
        events: ['pull_request'],
        active: true,
      });

      console.log(chalk.green(`Webhook created for ${owner}/${repo}`));
      return response.data.id;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(chalk.yellow(`Webhook already exists for ${owner}/${repo}`));
        // Try to find existing webhook
        const hooks = await this.octokit.rest.repos.listWebhooks({ owner, repo });
        const existingHook = hooks.data.find((hook) => hook.config.url === webhookUrl);
        return existingHook?.id || 0;
      }
      console.error(chalk.red(`Failed to create webhook: ${error instanceof Error ? error.message : 'Unknown error'}`));
      throw error;
    }
  }

  async deleteWebhook(owner: string, repo: string, hookId: number): Promise<void> {
    try {
      await this.octokit.rest.repos.deleteWebhook({
        owner,
        repo,
        hook_id: hookId,
      });
      console.log(chalk.green(`Webhook deleted for ${owner}/${repo}`));
    } catch (error: unknown) {
      console.error(chalk.red(`Failed to delete webhook: ${error instanceof Error ? error.message : 'Unknown error'}`));
      throw error;
    }
  }

  async listWebhooks(owner: string, repo: string): Promise<{ id: number; config: { url: string } }[]> {
    try {
      const response = await this.octokit.rest.repos.listWebhooks({ owner, repo });
      return response.data as { id: number; config: { url: string } }[];
    } catch (error: unknown) {
      console.error(chalk.red(`Failed to list webhooks: ${error instanceof Error ? error.message : 'Unknown error'}`));
      throw error;
    }
  }
}
