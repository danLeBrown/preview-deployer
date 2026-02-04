import { TExtraService } from '../types/preview-config';

function mergeRedisService(
  composeObj: Record<string, unknown>,
  extraServiceBlock: Record<string, unknown>,
): void {
  const services = (composeObj.services ?? {}) as Record<string, unknown>;
  const app = (services.app ?? {}) as Record<string, unknown>;

  const redisUrl = `redis://redis:6379`;
  (services as Record<string, unknown>).redis = extraServiceBlock;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const env = (app.environment as string[]) ?? [];
  if (!env.some((e) => e.startsWith('REDIS_URL='))) {
    app.environment = [...env, `REDIS_URL=${redisUrl}`];
  } else {
    // update the redis url
    app.environment = env.map((e) => (e.startsWith('REDIS_URL=') ? `REDIS_URL=${redisUrl}` : e));
  }
  app.depends_on = { redis: { condition: 'service_healthy' } };
}

function mergePostgresService(
  composeObj: Record<string, unknown>,
  extraServiceBlock: Record<string, unknown>,
): void {
  const services = (composeObj.services ?? {}) as Record<string, unknown>;
  const app = (services.app ?? {}) as Record<string, unknown>;

  const databaseUrl = `postgresql://preview:preview@postgres:5432/pr_{{prNumber}}`;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const env = (app.environment as string[]) ?? [];
  if (!env.some((e) => e.startsWith('DATABASE_URL='))) {
    app.environment = [...env, `DATABASE_URL=${databaseUrl}`];
  } else {
    // update the database url
    app.environment = env.map((e) =>
      e.startsWith('DATABASE_URL=') ? `DATABASE_URL=${databaseUrl}` : e,
    );
  }

  (services as Record<string, unknown>).postgres = extraServiceBlock;
  app.depends_on = { postgres: { condition: 'service_healthy' } };
}

function mergeMysqlService(
  composeObj: Record<string, unknown>,
  extraServiceBlock: Record<string, unknown>,
): void {
  const services = (composeObj.services ?? {}) as Record<string, unknown>;
  const app = (services.app ?? {}) as Record<string, unknown>;

  const databaseUrl = `mysql://preview:preview@mysql:3306/pr_{{prNumber}}`;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const env = (app.environment as string[]) ?? [];

  if (!env.some((e) => e.startsWith('DATABASE_URL='))) {
    app.environment = [...env, `DATABASE_URL=${databaseUrl}`];
  } else {
    // update the database url
    app.environment = env.map((e) =>
      e.startsWith('DATABASE_URL=') ? `DATABASE_URL=${databaseUrl}` : e,
    );
  }

  (services as Record<string, unknown>).mysql = extraServiceBlock;
  app.depends_on = { mysql: { condition: 'service_healthy' } };
}

function mergeMongodbService(
  composeObj: Record<string, unknown>,
  extraServiceBlock: Record<string, unknown>,
): void {
  const services = (composeObj.services ?? {}) as Record<string, unknown>;
  const app = (services.app ?? {}) as Record<string, unknown>;

  const databaseUrl = `mongodb://preview:preview@mongodb:27017/pr_{{prNumber}}`;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const env = (app.environment as string[]) ?? [];

  if (!env.some((e) => e.startsWith('DATABASE_URL='))) {
    app.environment = [...env, `DATABASE_URL=${databaseUrl}`];
  } else {
    // update the database url
    app.environment = env.map((e) =>
      e.startsWith('DATABASE_URL=') ? `DATABASE_URL=${databaseUrl}` : e,
    );
  }

  (services as Record<string, unknown>).mongodb = extraServiceBlock;
  app.depends_on = { mongodb: { condition: 'service_healthy' } };
}

export function mergeExtraService(
  composeObj: Record<string, unknown>,
  extraService: TExtraService,
  extraServiceBlock: Record<string, unknown>,
): void {
  switch (extraService) {
    case 'redis':
      mergeRedisService(composeObj, extraServiceBlock);
      break;
    case 'postgres':
      mergePostgresService(composeObj, extraServiceBlock);
      break;
    case 'mysql':
      mergeMysqlService(composeObj, extraServiceBlock);
      break;
    case 'mongodb':
      mergeMongodbService(composeObj, extraServiceBlock);
      break;
    default:
      throw new Error(`Unknown extra service: ${extraService}`);
  }
}
