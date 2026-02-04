import * as fs from 'fs/promises';

import {
  OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS,
  readRepoPreviewConfig,
  REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS,
} from './repo-config';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

jest.mock('./utils/framework-detection', () => ({
  fileExists: jest.fn(),
}));

const fsMock = jest.mocked(fs);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fileExists } = require('./utils/framework-detection') as { fileExists: jest.Mock };

describe('repo-config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS', () => {
    it('framework: accepts valid framework strings', () => {
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.framework('nestjs')).toBe(true);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.framework('go')).toBe(true);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.framework('laravel')).toBe(true);
    });
    it('framework: rejects invalid values', () => {
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.framework('invalid')).toBe(false);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.framework(1)).toBe(false);
    });
    it('database: accepts postgres, mysql, mongodb', () => {
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.database('postgres')).toBe(true);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.database('mysql')).toBe(true);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.database('mongodb')).toBe(true);
    });
    it('health_check_path: requires non-empty string starting with /', () => {
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.health_check_path('/health')).toBe(true);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.health_check_path('/')).toBe(true);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.health_check_path('health')).toBe(false);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.health_check_path('')).toBe(false);
    });
    it('app_port: requires positive number', () => {
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.app_port(3000)).toBe(true);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.app_port(0)).toBe(false);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.app_port(-1)).toBe(false);
    });
    it('app_port_env: requires non-empty string', () => {
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.app_port_env('PORT')).toBe(true);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.app_port_env('')).toBe(false);
    });
    it('app_entrypoint: requires non-empty string', () => {
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.app_entrypoint('dist/main.js')).toBe(true);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.app_entrypoint('server')).toBe(true);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.app_entrypoint('')).toBe(false);
      expect(REQUIRED_REPO_PREVIEW_CONFIG_VALIDATORS.app_entrypoint(1)).toBe(false);
    });
  });

  describe('OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS', () => {
    it('extra_services: accepts array of strings (allowlist enforced in parse)', () => {
      expect(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS.extra_services(['redis'])).toBe(true);
      expect(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS.extra_services(['postgres', 'redis'])).toBe(
        true,
      );
      expect(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS.extra_services([1])).toBe(false);
    });
    it('build_commands and startup_commands: accept string arrays', () => {
      expect(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS.build_commands(['cp .env .env.example'])).toBe(
        true,
      );
      expect(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS.startup_commands(['npm run migrate'])).toBe(
        true,
      );
      expect(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS.build_commands([1])).toBe(false);
    });
    it('env_file: accepts single path string, rejects array and invalid values', () => {
      expect(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS.env_file('.env')).toBe(true);
      expect(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS.env_file('.env.preview')).toBe(true);
      expect(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS.env_file('')).toBe(false);
      expect(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS.env_file(['.env'])).toBe(false);
      expect(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS.env_file('.env\n')).toBe(false);
      expect(OPTIONAL_REPO_PREVIEW_CONFIG_VALIDATORS.env_file('path\0with-null')).toBe(false);
    });
  });

  describe('readRepoPreviewConfig', () => {
    const workDir = '/tmp/repo';

    it('should throw when preview-config.yml is missing', async () => {
      fileExists.mockResolvedValue(false);
      await expect(readRepoPreviewConfig(workDir)).rejects.toThrow(
        'preview-config.yml is required at repository root but was not found',
      );
      expect(fsMock.readFile).not.toHaveBeenCalled();
    });

    it('should throw when YAML is invalid', async () => {
      fileExists.mockResolvedValue(true);
      fsMock.readFile.mockResolvedValue('invalid: yaml: [');
      await expect(readRepoPreviewConfig(workDir)).rejects.toThrow(
        /preview-config\.yml is invalid YAML/,
      );
    });

    it('should throw when required field is missing', async () => {
      fileExists.mockResolvedValue(true);
      fsMock.readFile.mockResolvedValue(
        'framework: nestjs\ndatabase: postgres\nhealth_check_path: /health\n# app_port and app_port_env missing',
      );
      await expect(readRepoPreviewConfig(workDir)).rejects.toThrow(/is required/);
    });

    it('should throw when app_entrypoint is missing', async () => {
      fileExists.mockResolvedValue(true);
      fsMock.readFile.mockResolvedValue(`
framework: nestjs
database: postgres
health_check_path: /health
app_port: 3000
app_port_env: PORT
`);
      await expect(readRepoPreviewConfig(workDir)).rejects.toThrow('app_entrypoint is required');
    });

    it('should return validated config when file is valid', async () => {
      fileExists.mockResolvedValue(true);
      fsMock.readFile.mockResolvedValue(`
framework: nestjs
database: postgres
health_check_path: /health
app_port: 3000
app_port_env: PORT
app_entrypoint: dist/main.js
`);
      const config = await readRepoPreviewConfig(workDir);
      expect(config.framework).toBe('nestjs');
      expect(config.database).toBe('postgres');
      expect(config.health_check_path).toBe('/health');
      expect(config.app_port).toBe(3000);
      expect(config.app_port_env).toBe('PORT');
      expect(config.app_entrypoint).toBe('dist/main.js');
    });

    it('should accept env_file as single string and include it in config', async () => {
      fileExists.mockResolvedValue(true);
      fsMock.readFile.mockResolvedValue(`
framework: nestjs
database: postgres
health_check_path: /health
app_port: 3000
app_port_env: PORT
app_entrypoint: dist/main.js
env_file: .env
`);
      const config = await readRepoPreviewConfig(workDir);
      expect(config.env_file).toBe('.env');
    });

    it('should throw when env_file is an array', async () => {
      fileExists.mockResolvedValue(true);
      fsMock.readFile.mockResolvedValue(`
framework: nestjs
database: postgres
health_check_path: /health
app_port: 3000
app_port_env: PORT
app_entrypoint: dist/main.js
env_file:
  - .env
  - .env.preview
`);
      await expect(readRepoPreviewConfig(workDir)).rejects.toThrow(
        'env_file must be a single path (string), not an array',
      );
    });
  });
});
