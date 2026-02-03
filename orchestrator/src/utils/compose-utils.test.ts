import type { IValidatedRepoPreviewConfig } from '../repo-config';
import {
  applyRepoConfigToAppService,
  dumpCompose,
  getDefaultCommandForFramework,
  injectPortsIntoRepoCompose,
  parseComposeToObject,
  renderComposeTemplate,
} from './compose-utils';

const minimalValidConfig: IValidatedRepoPreviewConfig = {
  framework: 'nestjs',
  database: 'postgres',
  health_check_path: '/health',
  app_port: 3000,
  app_port_env: 'PORT',
};

describe('compose-utils', () => {
  describe('renderComposeTemplate', () => {
    it('should interpolate Handlebars placeholders', () => {
      const template = 'app_port: {{appPort}}\nproject: {{projectSlug}}';
      const result = renderComposeTemplate(template, {
        appPort: 3000,
        projectSlug: 'myorg-myapp',
      });
      expect(result).toBe('app_port: 3000\nproject: myorg-myapp');
    });

    it('should leave missing placeholders empty', () => {
      const template = 'x: {{x}}';
      const result = renderComposeTemplate(template, {});
      expect(result).toBe('x: ');
    });
  });

  describe('parseComposeToObject', () => {
    it('should parse valid YAML to object', () => {
      const yaml = 'services:\n  app:\n    image: node:20';
      const result = parseComposeToObject(yaml);
      expect(result).toEqual({
        services: { app: { image: 'node:20' } },
      });
    });

    it('should return empty object for empty YAML', () => {
      const result = parseComposeToObject('');
      expect(result).toEqual({});
    });
  });

  describe('dumpCompose', () => {
    it('should serialize object to YAML string', () => {
      const obj = { services: { app: { image: 'node:20' } } };
      const result = dumpCompose(obj);
      expect(result).toContain('services:');
      expect(result).toContain('app:');
      expect(result).toContain('node:20');
    });
  });

  describe('getDefaultCommandForFramework', () => {
    it('should return correct command for nestjs', () => {
      expect(getDefaultCommandForFramework('nestjs')).toEqual(['node', 'dist/main']);
    });
    it('should return correct command for go', () => {
      expect(getDefaultCommandForFramework('go')).toEqual(['./server']);
    });
    it('should return correct command for laravel', () => {
      expect(getDefaultCommandForFramework('laravel')).toEqual([
        'php',
        'artisan',
        'serve',
        '--host=0.0.0.0',
        '--port=8000',
      ]);
    });
    it('should return correct command for rust and python', () => {
      expect(getDefaultCommandForFramework('rust')).toEqual(['cargo', 'run']);
      expect(getDefaultCommandForFramework('python')).toEqual(['python', 'app.py']);
    });
  });

  describe('injectPortsIntoRepoCompose', () => {
    it('should set app service ports from port allocation', () => {
      const composeObj: Record<string, unknown> = {
        services: { app: { image: 'app' } },
      };
      injectPortsIntoRepoCompose(composeObj, minimalValidConfig, {
        exposedAppPort: 8012,
        exposedDbPort: 9012,
      });
      expect((composeObj.services as Record<string, unknown>).app).toEqual({
        image: 'app',
        ports: ['8012:3000'],
      });
    });

    it('should not add ports when app service is missing', () => {
      const composeObj: Record<string, unknown> = { services: { db: {} } };
      injectPortsIntoRepoCompose(composeObj, minimalValidConfig, {
        exposedAppPort: 8012,
        exposedDbPort: 9012,
      });
      expect(composeObj.services).toEqual({ db: {} });
    });

    it('should handle empty services', () => {
      const composeObj: Record<string, unknown> = { services: {} };
      injectPortsIntoRepoCompose(composeObj, minimalValidConfig, {
        exposedAppPort: 8012,
        exposedDbPort: 9012,
      });
      expect(composeObj.services).toEqual({});
    });
  });

  describe('applyRepoConfigToAppService', () => {
    it('should set entrypoint and command when startup_commands present', () => {
      const composeObj: Record<string, unknown> = {
        services: { app: { image: 'app' } },
      };
      const config: IValidatedRepoPreviewConfig = {
        ...minimalValidConfig,
        startup_commands: ['npm run migration:run', 'npm run seed'],
      };
      applyRepoConfigToAppService(composeObj, config);
      const app = (composeObj.services as Record<string, unknown>).app as Record<string, unknown>;
      expect(app.entrypoint).toEqual([
        '/bin/sh',
        '-c',
        'npm run migration:run && npm run seed && exec "$@"',
        '--',
      ]);
      expect(app.command).toEqual(['node', 'dist/main']);
    });

    it('should not mutate app when startup_commands absent', () => {
      const composeObj: Record<string, unknown> = {
        services: { app: { image: 'app' } },
      };
      applyRepoConfigToAppService(composeObj, minimalValidConfig);
      const app = (composeObj.services as Record<string, unknown>).app as Record<string, unknown>;
      expect(app.entrypoint).toBeUndefined();
      expect(app.command).toBeUndefined();
    });
  });
});
