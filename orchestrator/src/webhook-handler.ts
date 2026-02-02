import * as crypto from 'crypto';
import { Logger } from 'pino';

import { DockerManager } from './docker-manager';
import { GitHubClient } from './github-client';
import { NginxManager } from './nginx-manager';
import { toDeploymentId, toProjectSlug } from './project-slug';
import { IDeploymentTracker } from './types/deployment';
import { IDeploymentInfo, IPreviewConfig, IWebhookPayload } from './types/preview-config';

export class WebhookHandler {
  private webhookSecret: string;
  private allowedRepos: string[];
  private githubClient: GitHubClient;
  private dockerManager: DockerManager;
  private nginxManager: NginxManager;
  private tracker: IDeploymentTracker;
  private logger: Logger;

  constructor(
    webhookSecret: string,
    allowedRepos: string[],
    githubClient: GitHubClient,
    dockerManager: DockerManager,
    nginxManager: NginxManager,
    tracker: IDeploymentTracker,
    logger: Logger,
  ) {
    this.webhookSecret = webhookSecret;
    this.allowedRepos = allowedRepos;
    this.githubClient = githubClient;
    this.dockerManager = dockerManager;
    this.nginxManager = nginxManager;
    this.tracker = tracker;
    this.logger = logger;
  }

  verifySignature(payload: string, signature: string): boolean {
    if (!signature) {
      return false;
    }

    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));

    if (!isValid) {
      this.logger.warn('Webhook signature verification failed');
    }

    return isValid;
  }

  validateRepository(repoFullName: string): boolean {
    const isAllowed = this.allowedRepos.includes(repoFullName);
    if (!isAllowed) {
      this.logger.warn(
        { repoFullName, allowedRepos: this.allowedRepos },
        'Repository not in allowed list',
      );
    }
    return isAllowed;
  }

  async handleWebhook(payload: IWebhookPayload): Promise<void> {
    const { action, pull_request, repository } = payload;
    const repoFullName = repository.full_name;
    const prNumber = pull_request.number;

    // Validate repository
    if (!this.validateRepository(repoFullName)) {
      throw new Error(`Repository ${repoFullName} is not in the allowed list`);
    }

    this.logger.info({ action, repoFullName, prNumber }, 'Processing webhook');

    try {
      switch (action) {
        case 'opened':
        case 'reopened':
          await this.handleDeploy(payload);
          break;
        case 'synchronize':
          await this.handleUpdate(payload);
          break;
        case 'closed':
          await this.handleCleanup(payload);
          break;
        default:
          this.logger.debug({ action }, 'Unhandled webhook action');
      }
    } catch (error: unknown) {
      this.logger.error(
        {
          action,
          repoFullName,
          prNumber,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Webhook handling failed',
      );

      // Post failure comment to GitHub
      try {
        const comment = GitHubClient.formatComment('failure');
        await this.githubClient.postComment(
          repository.owner.login,
          repository.name,
          prNumber,
          comment,
        );
      } catch (commentError: unknown) {
        this.logger.error(
          { error: commentError instanceof Error ? commentError.message : 'Unknown error' },
          'Failed to post failure comment',
        );
      }

      throw error;
    }
  }

  private async handleDeploy(payload: IWebhookPayload): Promise<void> {
    const { pull_request, repository } = payload;
    const prNumber = pull_request.number;
    const repoOwner = repository.owner.login;
    const repoName = repository.name;
    const projectSlug = toProjectSlug(repoOwner, repoName);
    const deploymentId = toDeploymentId(projectSlug, prNumber);

    // Check if deployment already exists
    const existingDeployment = this.tracker.getDeployment(deploymentId);
    if (existingDeployment) {
      this.logger.info({ deploymentId }, 'Deployment already exists, updating instead');
      await this.handleUpdate(payload);
      return;
    }

    // Post building comment
    let commentId: number | undefined;
    try {
      const buildingComment = GitHubClient.formatComment('building');
      commentId = await this.githubClient.postComment(
        repoOwner,
        repoName,
        prNumber,
        buildingComment,
      );
    } catch (error: unknown) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to post building comment',
      );
      // Continue with deployment even if comment fails
    }

    // Create preview config
    const config: IPreviewConfig = {
      prNumber,
      repoName,
      repoOwner,
      projectSlug,
      deploymentId,
      branch: pull_request.head.ref,
      commitSha: pull_request.head.sha,
      cloneUrl: pull_request.head.repo.clone_url,
      framework: 'nestjs', // Will be detected during deployment
      dbType: 'postgres',
    };

    // Deploy preview (framework and dbType resolved from repo preview-config.yml or detection)
    const { url, appPort, dbPort, framework, dbType } =
      await this.dockerManager.deployPreview(config);

    // Add nginx config
    await this.nginxManager.addPreview(projectSlug, prNumber, appPort);

    // Save deployment info with resolved framework and dbType
    const deployment: IDeploymentInfo = {
      ...config,
      framework,
      dbType,
      appPort,
      dbPort,
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      url,
      commentId,
    };

    await this.tracker.saveDeployment(deployment);

    // Update comment with success
    if (commentId) {
      try {
        const successComment = GitHubClient.formatComment('success', url);
        await this.githubClient.updateComment(repoOwner, repoName, commentId, successComment);
      } catch (error: unknown) {
        this.logger.error(
          { error: error instanceof Error ? error.message : 'Unknown error' },
          'Failed to update comment',
        );
      }
    }

    this.logger.info({ deploymentId, url }, 'Preview deployed successfully');
  }

  private async handleUpdate(payload: IWebhookPayload): Promise<void> {
    const { pull_request, repository } = payload;
    const prNumber = pull_request.number;
    const repoOwner = repository.owner.login;
    const repoName = repository.name;
    const deploymentId = toDeploymentId(toProjectSlug(repoOwner, repoName), prNumber);

    const deployment = this.tracker.getDeployment(deploymentId);
    if (!deployment) {
      this.logger.warn({ deploymentId }, 'Deployment not found for update, deploying new');
      await this.handleDeploy(payload);
      return;
    }

    // Post building comment
    const commentId = deployment.commentId;
    if (commentId) {
      try {
        const buildingComment = GitHubClient.formatComment('building');
        await this.githubClient.updateComment(repoOwner, repoName, commentId, buildingComment);
      } catch (error: unknown) {
        this.logger.error(
          { error: error instanceof Error ? error.message : 'Unknown error' },
          'Failed to update building comment',
        );
      }
    }

    // Update preview
    await this.dockerManager.updatePreview(deploymentId, pull_request.head.sha);

    // Update deployment info
    deployment.commitSha = pull_request.head.sha;
    deployment.updatedAt = new Date().toISOString();
    deployment.status = 'running';
    await this.tracker.saveDeployment(deployment);

    // Update comment with success
    if (commentId && deployment.url) {
      try {
        const successComment = GitHubClient.formatComment('success', deployment.url);
        await this.githubClient.updateComment(repoOwner, repoName, commentId, successComment);
      } catch (error: unknown) {
        this.logger.error(
          { error: error instanceof Error ? error.message : 'Unknown error' },
          'Failed to update comment',
        );
      }
    }

    this.logger.info({ deploymentId }, 'Preview updated successfully');
  }

  private async handleCleanup(payload: IWebhookPayload): Promise<void> {
    const { pull_request, repository } = payload;
    const prNumber = pull_request.number;
    const deploymentId = toDeploymentId(
      toProjectSlug(repository.owner.login, repository.name),
      prNumber,
    );

    const deployment = this.tracker.getDeployment(deploymentId);
    if (!deployment) {
      this.logger.warn({ deploymentId }, 'Deployment not found for cleanup');
      return;
    }

    // Cleanup Docker containers (stops compose, removes work dir, releases ports)
    await this.dockerManager.cleanupPreview(deploymentId);

    // Remove nginx config
    await this.nginxManager.removePreview(deployment.projectSlug, prNumber);

    // Delete deployment record
    await this.tracker.deleteDeployment(deploymentId);

    this.logger.info({ deploymentId }, 'Preview cleaned up successfully');
  }
}
