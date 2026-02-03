import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { NginxManager } from './nginx-manager';

const mockLogger = {
  debug: () => void 0,
  error: () => void 0,
  info: () => void 0,
  warn: () => void 0,
  child: () => mockLogger,
};

describe('NginxManager Integration', () => {
  let configDir: string;
  let manager: NginxManager;

  beforeEach(async () => {
    configDir = path.join(
      os.tmpdir(),
      `preview-nginx-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(configDir, { recursive: true });
    manager = new NginxManager(configDir, mockLogger as never, {
      reloadCommand: async () => void 0,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(configDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should create nginx config file with path-based routing and proxy_pass to appPort', async () => {
    const projectSlug = 'myorg-myapp';
    const prNumber = 42;
    const appPort = 8042;

    await manager.addPreview(projectSlug, prNumber, appPort);

    const configPath = path.join(configDir, `${projectSlug}-pr-${prNumber}.conf`);
    const content = await fs.readFile(configPath, 'utf-8');

    expect(content).toContain(`location /${projectSlug}/pr-${prNumber}/`);
    expect(content).toContain(`proxy_pass http://localhost:${appPort}/`);
  });

  it('should remove nginx config file on removePreview', async () => {
    const projectSlug = 'test-repo';
    const prNumber = 1;
    const appPort = 8000;

    await manager.addPreview(projectSlug, prNumber, appPort);
    const configPath = path.join(configDir, `${projectSlug}-pr-${prNumber}.conf`);
    await expect(fs.access(configPath)).resolves.toBeUndefined();

    await manager.removePreview(projectSlug, prNumber);
    await expect(fs.access(configPath)).rejects.toThrow(/ENOENT/);
  });
});
