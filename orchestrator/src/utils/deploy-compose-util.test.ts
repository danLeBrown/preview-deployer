/**
 * Unit tests for deploy-compose-util (resolveAndWriteComposeFile, buildContainersAndWaitForHealthy).
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  buildContainersAndWaitForHealthy,
  resolveAndWriteComposeFile,
} from './deploy-compose-util';

describe('deploy-compose-util', () => {
  const mockRepoConfig = {
    framework: 'nestjs' as const,
    database: 'postgres' as const,
    health_check_path: '/health',
    app_port_env: 'PORT',
    app_port: 3000,
    app_entrypoint: 'dist/main.js',
    extra_services: [] as const,
  };

  describe('resolveAndWriteComposeFile', () => {
    let workDir: string;

    beforeEach(async () => {
      workDir = path.join(
        os.tmpdir(),
        `deploy-compose-util-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await fs.mkdir(workDir, { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => void 0);
    });

    it('should use repo compose when docker-compose.preview.yml exists', async () => {
      const repoCompose = 'services:\n  app:\n    image: node:20\n';
      await fs.writeFile(path.join(workDir, 'docker-compose.preview.yml'), repoCompose, 'utf-8');

      const result = await resolveAndWriteComposeFile(
        workDir,
        mockRepoConfig as never,
        { exposedAppPort: 8001, exposedDbPort: 9001 },
        { mode: 'update' },
      );

      expect(result.useRepoCompose).toBe(true);
      expect(result.composeFile).toContain('docker-compose.preview.generated.yml');
      const written = await fs.readFile(result.composeFile, 'utf-8');
      expect(written).toContain('8001:3000');
    });

    it('should return getComposeFilePath when mode is update and no repo compose', async () => {
      const result = await resolveAndWriteComposeFile(
        workDir,
        mockRepoConfig as never,
        { exposedAppPort: 8001, exposedDbPort: 9001 },
        { mode: 'update' },
      );

      expect(result.useRepoCompose).toBe(false);
      expect(result.composeFile).toBe(path.join(workDir, 'docker-compose.preview.yml'));
    });

    it('should call generateCompose when mode is deploy and no repo compose', async () => {
      const generatedPath = path.join(workDir, 'docker-compose.preview.yml');
      const generateCompose = jest.fn().mockResolvedValue(generatedPath);

      const result = await resolveAndWriteComposeFile(
        workDir,
        mockRepoConfig as never,
        { exposedAppPort: 8001, exposedDbPort: 9001 },
        { mode: 'deploy', generateCompose },
      );

      expect(result.useRepoCompose).toBe(false);
      expect(result.composeFile).toBe(generatedPath);
      expect(generateCompose).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildContainersAndWaitForHealthy', () => {
    it('should call runCompose then waitForHealthy and return result', async () => {
      const runCompose = jest.fn().mockResolvedValue(undefined);
      const waitForHealthy = jest.fn().mockResolvedValue({
        isHealthy: true,
        healthUrl: 'http://localhost:8001/health',
      });
      const logInfo = jest.fn();

      const result = await buildContainersAndWaitForHealthy(
        '/work',
        'org-repo-1',
        '/work/docker-compose.preview.yml',
        8001,
        '/health',
        false,
        { runCompose, waitForHealthy, logInfo },
      );

      expect(logInfo).toHaveBeenCalledWith(
        { deploymentId: 'org-repo-1', useRepoCompose: false },
        'Building containers',
      );
      expect(runCompose).toHaveBeenCalledWith(
        '/work',
        'org-repo-1',
        '/work/docker-compose.preview.yml',
      );
      expect(logInfo).toHaveBeenCalledWith(
        { deploymentId: 'org-repo-1', useRepoCompose: false },
        'Done building containers. Starting health check.',
      );
      expect(waitForHealthy).toHaveBeenCalledWith(8001, '/health', 15);
      expect(result).toEqual({ isHealthy: true, healthUrl: 'http://localhost:8001/health' });
    });
  });
});
