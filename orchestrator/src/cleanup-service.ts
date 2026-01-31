import { DeploymentTracker } from './types/deployment';
import { GitHubClient } from './github-client';
import { DockerManager } from './docker-manager';
import { NginxManager } from './nginx-manager';
import { DeploymentInfo } from './types/preview-config';
import { Logger } from 'pino';

export class CleanupService {
  private tracker: DeploymentTracker;
  private githubClient: GitHubClient;
  private dockerManager: DockerManager;
  private nginxManager: NginxManager;
  private ttlDays: number;
  private logger: Logger;
  private intervalId?: NodeJS.Timeout;

  constructor(
    tracker: DeploymentTracker,
    githubClient: GitHubClient,
    dockerManager: DockerManager,
    nginxManager: NginxManager,
    ttlDays: number,
    logger: Logger
  ) {
    this.tracker = tracker;
    this.githubClient = githubClient;
    this.dockerManager = dockerManager;
    this.nginxManager = nginxManager;
    this.ttlDays = ttlDays;
    this.logger = logger;
  }

  startScheduledCleanup(intervalHours: number = 6): void {
    // Run cleanup immediately on startup
    this.cleanupStaleDeployments(this.ttlDays).catch((error) => {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Initial cleanup failed'
      );
    });

    // Schedule periodic cleanup
    const intervalMs = intervalHours * 60 * 60 * 1000;
    this.intervalId = setInterval(() => {
      this.cleanupStaleDeployments(this.ttlDays).catch((error) => {
        this.logger.error(
          { error: error instanceof Error ? error.message : 'Unknown error' },
          'Scheduled cleanup failed'
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
        const age = this.tracker.getDeploymentAge(deployment.prNumber);
        const isStale = age > ttlDays;

        // Check if PR is closed/merged
        let isPRClosed = false;
        try {
          const prStatus = await this.githubClient.checkPRStatus(
            deployment.repoOwner,
            deployment.repoName,
            deployment.prNumber
          );
          isPRClosed = prStatus !== 'open';
        } catch (error: unknown) {
          this.logger.warn(
            {
              prNumber: deployment.prNumber,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            'Failed to check PR status, assuming open'
          );
        }

        if (isStale || isPRClosed) {
          this.logger.info(
            { prNumber: deployment.prNumber, age: age.toFixed(2), isStale, isPRClosed },
            'Cleaning up deployment'
          );

          await this.cleanupDeployment(deployment);
        }
      } catch (error: unknown) {
        this.logger.error(
          {
            prNumber: deployment.prNumber,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to cleanup deployment'
        );
      }
    }

    this.logger.info('Cleanup completed');
  }

  private async cleanupDeployment(deployment: DeploymentInfo): Promise<void> {
    const { prNumber } = deployment;

    try {
      // Cleanup Docker containers
      await this.dockerManager.cleanupPreview(prNumber);

      // Remove nginx config
      await this.nginxManager.removePreview(prNumber);

      // Delete deployment record
      await this.tracker.deleteDeployment(prNumber);

      this.logger.info({ prNumber }, 'Deployment cleaned up successfully');
    } catch (error: unknown) {
      this.logger.error(
        { prNumber, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to cleanup deployment'
      );
      throw error;
    }
  }
}
