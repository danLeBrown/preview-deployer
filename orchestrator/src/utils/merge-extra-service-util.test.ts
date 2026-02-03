import { mergeExtraService } from './merge-extra-service-util';

describe('merge-extra-service-util', () => {
  function baseCompose(): Record<string, unknown> {
    return {
      services: {
        app: {
          image: 'app',
          environment: ['NODE_ENV=preview'],
        },
      },
    };
  }

  describe('mergeExtraService', () => {
    it('should merge redis: add redis service, REDIS_URL, and depends_on', () => {
      const composeObj = baseCompose();
      const redisBlock = { image: 'redis:7', ports: ['6379:6379'] };
      mergeExtraService(composeObj, 'redis', redisBlock);
      const services = composeObj.services as Record<string, unknown>;
      expect(services.redis).toEqual(redisBlock);
      expect(services.app).toBeDefined();
      const app = services.app as Record<string, unknown>;
      expect((app.environment as string[]).some((e) => e.startsWith('REDIS_URL='))).toBe(true);
      expect(app.depends_on).toEqual({ redis: { condition: 'service_started' } });
    });

    it('should merge postgres: add postgres service, DATABASE_URL, and depends_on', () => {
      const composeObj = baseCompose();
      const postgresBlock = { image: 'postgres:16' };
      mergeExtraService(composeObj, 'postgres', postgresBlock);
      const services = composeObj.services as Record<string, unknown>;
      expect(services.postgres).toEqual(postgresBlock);
      const app = services.app as Record<string, unknown>;
      expect((app.environment as string[]).some((e) => e.startsWith('DATABASE_URL='))).toBe(true);
      expect(app.depends_on).toEqual({ postgres: { condition: 'service_started' } });
    });

    it('should merge mysql: add mysql service, DATABASE_URL, and depends_on', () => {
      const composeObj = baseCompose();
      const mysqlBlock = { image: 'mysql:8' };
      mergeExtraService(composeObj, 'mysql', mysqlBlock);
      const services = composeObj.services as Record<string, unknown>;
      expect(services.mysql).toEqual(mysqlBlock);
      const app = services.app as Record<string, unknown>;
      expect((app.environment as string[]).some((e) => e.startsWith('DATABASE_URL='))).toBe(true);
      expect(app.depends_on).toEqual({ mysql: { condition: 'service_started' } });
    });

    it('should merge mongodb: add mongodb service, DATABASE_URL, and depends_on', () => {
      const composeObj = baseCompose();
      const mongodbBlock = { image: 'mongo:7' };
      mergeExtraService(composeObj, 'mongodb', mongodbBlock);
      const services = composeObj.services as Record<string, unknown>;
      expect(services.mongodb).toEqual(mongodbBlock);
      const app = services.app as Record<string, unknown>;
      expect((app.environment as string[]).some((e) => e.startsWith('DATABASE_URL='))).toBe(true);
      expect(app.depends_on).toEqual({ mongodb: { condition: 'service_started' } });
    });

    it('should throw for unknown extra service', () => {
      const composeObj = baseCompose();
      expect(() => mergeExtraService(composeObj, 'unknown' as 'redis', { image: 'x' })).toThrow(
        'Unknown extra service: unknown',
      );
    });

    it('should update existing REDIS_URL when merging redis', () => {
      const composeObj = baseCompose();
      (composeObj.services as Record<string, unknown>).app = {
        environment: ['REDIS_URL=redis://old:6379'],
      };
      mergeExtraService(composeObj, 'redis', { image: 'redis:7' });
      const app = (composeObj.services as Record<string, unknown>).app as Record<string, unknown>;
      expect((app.environment as string[]).find((e) => e.startsWith('REDIS_URL='))).toBe(
        'REDIS_URL=redis://redis:6379',
      );
    });
  });
});
