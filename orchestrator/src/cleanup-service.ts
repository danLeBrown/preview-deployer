import { Logger } from 'pino';

import { DockerManager } from './docker-manager';
import { GitHubClient } from './github-client';
import { NginxManager } from './nginx-manager';
import { IDeploymentTracker } from './types/deployment';
import { IDeploymentInfo } from './types/preview-config';

export class CleanupService {
  private tracker: IDeploymentTracker;
  private githubClient: GitHubClient;
  private dockerManager: DockerManager;
  private nginxManager: NginxManager;
  private ttlDays: number;
  private logger: Logger;
  private intervalId?: NodeJS.Timeout;

  constructor(
    tracker: IDeploymentTracker,
    githubClient: GitHubClient,
    dockerManager: DockerManager,
    nginxManager: NginxManager,
    ttlDays: number,
    logger: Logger,
  ) {
    this.tracker = tracker;
    this.githubClient = githubClient;
    this.dockerManager = dockerManager;
    this.nginxManager = nginxManager;
    this.ttlDays = ttlDays;
    this.logger = logger;
  }

  startScheduledCleanup(intervalHours = 6): void {
    // Run cleanup immediately on startup
    this.cleanupStaleDeployments(this.ttlDays).catch((error) => {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Initial cleanup failed',
      );
    });

    // Schedule periodic cleanup
    const intervalMs = intervalHours * 60 * 60 * 1000;
    this.intervalId = setInterval(() => {
      this.cleanupStaleDeployments(this.ttlDays).catch((error) => {
        this.logger.error(
          { error: error instanceof Error ? error.message : 'Unknown error' },
          'Scheduled cleanup failed',
        );
      });
    }, intervalMs);

    this.logger.info({ intervalHours }, 'Scheduled cleanup started');
  }

  stopScheduledCleanup(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      this.logger.info('Scheduled cleanup stopped');
    }
  }

  async cleanupStaleDeployments(ttlDays: number): Promise<void> {
    this.logger.info('Starting cleanup of stale deployments');

    const deployments = this.tracker.getAllDeployments();

    for (const deployment of deployments) {
      try {
        const age = this.tracker.getDeploymentAge(deployment.deploymentId);
        const isStale = age > ttlDays;

        // Check if PR is closed/merged
        let isPRClosed = false;
        try {
          const prStatus = await this.githubClient.checkPRStatus(
            deployment.repoOwner,
            deployment.repoName,
            deployment.prNumber,
          );
          isPRClosed = prStatus !== 'open';
        } catch (error: unknown) {
          this.logger.warn(
            {
              deploymentId: deployment.deploymentId,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            'Failed to check PR status, assuming open',
          );
        }

        if (isStale || isPRClosed) {
          this.logger.info(
            {
              deploymentId: deployment.deploymentId,
              age: age.toFixed(2),
              isStale,
              isPRClosed,
            },
            'Cleaning up deployment',
          );

          await this.cleanupDeployment(deployment);
        }
      } catch (error: unknown) {
        this.logger.error(
          {
            deploymentId: deployment.deploymentId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to cleanup deployment',
        );
      }
    }

    this.logger.info('Cleanup completed');
  }

  private async cleanupDeployment(deployment: IDeploymentInfo): Promise<void> {
    const { deploymentId, projectSlug, prNumber } = deployment;

    try {
      // Cleanup Docker containers (stops compose, removes work dir, releases ports)
      await this.dockerManager.cleanupPreview(deploymentId);

      // Remove nginx config
      await this.nginxManager.removePreview(projectSlug, prNumber);

      // Delete deployment record (ports already released by cleanupPreview)
      await this.tracker.deleteDeployment(deploymentId);

      this.logger.info({ deploymentId }, 'Deployment cleaned up successfully');
    } catch (error: unknown) {
      this.logger.error(
        { deploymentId, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to cleanup deployment',
      );
      throw error;
    }
  }
}
