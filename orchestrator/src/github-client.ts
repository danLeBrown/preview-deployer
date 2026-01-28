import { Octokit } from '@octokit/rest';
import { PRStatus } from './types/preview-config';

export class GitHubClient {
  private octokit: Octokit;
  private logger: any;

  constructor(token: string, logger: any) {
    this.octokit = new Octokit({ auth: token });
    this.logger = logger;
  }

  async postComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ): Promise<number> {
    try {
      const response = await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
      this.logger.info(
        { owner, repo, prNumber, commentId: response.data.id },
        'Posted GitHub comment'
      );
      return response.data.id;
    } catch (error: any) {
      this.logger.error(
        { owner, repo, prNumber, error: error.message },
        'Failed to post GitHub comment'
      );
      throw error;
    }
  }

  async updateComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string
  ): Promise<void> {
    try {
      await this.octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: commentId,
        body,
      });
      this.logger.info(
        { owner, repo, commentId },
        'Updated GitHub comment'
      );
    } catch (error: any) {
      this.logger.error(
        { owner, repo, commentId, error: error.message },
        'Failed to update GitHub comment'
      );
      throw error;
    }
  }

  async checkPRStatus(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PRStatus> {
    try {
      const response = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      if (response.data.merged) {
        return 'merged';
      }
      return response.data.state === 'open' ? 'open' : 'closed';
    } catch (error: any) {
      this.logger.error(
        { owner, repo, prNumber, error: error.message },
        'Failed to check PR status'
      );
      throw error;
    }
  }

  static formatComment(type: 'building' | 'success' | 'failure', url?: string): string {
    switch (type) {
      case 'building':
        return '🔨 Building preview environment...';
      case 'success':
        return `🚀 Preview deployed! Access your app at ${url}`;
      case 'failure':
        return '❌ Preview deployment failed. Check logs for details.';
      default:
        return '';
    }
  }
}
