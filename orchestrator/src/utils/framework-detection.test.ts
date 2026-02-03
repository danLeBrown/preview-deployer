import * as fs from 'fs/promises';

import type { IRepoPreviewConfig } from '../types/preview-config';
import {
  detectFramework,
  detectGo,
  detectLaravel,
  detectNestJS,
  resolveFramework,
} from './framework-detection';

jest.mock('fs/promises', () => ({
  access: jest.fn(),
  readFile: jest.fn(),
}));

const fsMock = jest.mocked(fs);

describe('framework-detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectNestJS', () => {
    it('should return nestjs when nest-cli.json exists', async () => {
      fsMock.access.mockResolvedValue(undefined);
      const result = await detectNestJS('/repo');
      expect(result).toBe('nestjs');
      expect(fsMock.access).toHaveBeenCalledWith(expect.stringContaining('nest-cli.json'));
    });

    it('should return nestjs when package.json has @nestjs/core', async () => {
      fsMock.access.mockRejectedValue(new Error('ENOENT'));
      fsMock.readFile.mockResolvedValue(
        JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0' } }),
      );
      const result = await detectNestJS('/repo');
      expect(result).toBe('nestjs');
    });

    it('should return null when neither nest-cli nor @nestjs/core present', async () => {
      fsMock.access.mockRejectedValue(new Error('ENOENT'));
      fsMock.readFile.mockResolvedValue(JSON.stringify({ dependencies: {} }));
      const result = await detectNestJS('/repo');
      expect(result).toBeNull();
    });
  });

  describe('detectGo', () => {
    it('should return go when go.mod exists', async () => {
      fsMock.access.mockResolvedValue(undefined);
      const result = await detectGo('/repo');
      expect(result).toBe('go');
      expect(fsMock.access).toHaveBeenCalledWith(expect.stringContaining('go.mod'));
    });

    it('should return null when go.mod missing', async () => {
      fsMock.access.mockRejectedValue(new Error('ENOENT'));
      const result = await detectGo('/repo');
      expect(result).toBeNull();
    });
  });

  describe('detectLaravel', () => {
    it('should return laravel when composer.json has laravel/framework', async () => {
      fsMock.readFile.mockResolvedValue(
        JSON.stringify({ require: { 'laravel/framework': '^10.0' } }),
      );
      const result = await detectLaravel('/repo');
      expect(result).toBe('laravel');
    });

    it('should return null when composer.json missing or no laravel', async () => {
      fsMock.readFile.mockRejectedValue(new Error('ENOENT'));
      const result = await detectLaravel('/repo');
      expect(result).toBeNull();
    });
  });

  describe('detectFramework', () => {
    it('should return first match (nestjs before go)', async () => {
      fsMock.access.mockImplementation((path: import('fs').PathLike) => {
        if (String(path).includes('nest-cli.json')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('ENOENT'));
      });
      const result = await detectFramework('/repo');
      expect(result).toBe('nestjs');
    });

    it('should return go when nest not found but go.mod exists', async () => {
      fsMock.access.mockImplementation((path: import('fs').PathLike) => {
        if (String(path).includes('go.mod')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('ENOENT'));
      });
      fsMock.readFile.mockRejectedValue(new Error('ENOENT'));
      const result = await detectFramework('/repo');
      expect(result).toBe('go');
    });

    it('should return nestjs as default when no detector matches', async () => {
      fsMock.access.mockRejectedValue(new Error('ENOENT'));
      fsMock.readFile.mockRejectedValue(new Error('ENOENT'));
      const result = await detectFramework('/repo');
      expect(result).toBe('nestjs');
    });
  });

  describe('resolveFramework', () => {
    it('should use repo config framework when present', async () => {
      const repoConfig: IRepoPreviewConfig = { framework: 'go' };
      const result = await resolveFramework('/repo', repoConfig);
      expect(result).toBe('go');
      expect(fsMock.access).not.toHaveBeenCalled();
    });

    it('should detect from repo when repo config has no framework', async () => {
      fsMock.access.mockImplementation((path: import('fs').PathLike) => {
        if (String(path).includes('go.mod')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('ENOENT'));
      });
      fsMock.readFile.mockRejectedValue(new Error('ENOENT'));
      const result = await resolveFramework('/repo', {});
      expect(result).toBe('go');
    });

    it('should detect when repo config is empty object', async () => {
      fsMock.access.mockRejectedValue(new Error('ENOENT'));
      fsMock.readFile.mockRejectedValue(new Error('ENOENT'));
      const result = await resolveFramework('/repo', {});
      expect(result).toBe('nestjs');
    });
  });
});
