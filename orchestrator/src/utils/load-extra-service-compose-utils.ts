import * as fs from 'fs/promises';
import * as path from 'path';

import { TExtraService } from '../types/preview-config';
import { IComposeTemplateData, parseComposeToObject, renderComposeTemplate } from './compose-utils';

export type IDatabaseExtraServiceTemplateData = Pick<
  IComposeTemplateData,
  'projectSlug' | 'prNumber' | 'exposedDbPort'
>;

export interface IExtraServiceTemplateData extends IDatabaseExtraServiceTemplateData {
  extraService: TExtraService;
}

export const EXTRA_SERVICE_BLOCK_LOADERS = {
  redis: loadRedisServiceBlock,
  postgres: loadPostgresServiceBlock,
  mysql: loadMysqlServiceBlock,
  mongodb: loadMongodbServiceBlock,
};

export async function loadExtraServiceBlock(
  extraServiceTemplatesDir: string,
  data: IExtraServiceTemplateData,
): Promise<Record<string, unknown>> {
  const loader = EXTRA_SERVICE_BLOCK_LOADERS[data.extraService];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!loader) {
    throw new Error(`Unknown extra service: ${data.extraService}`);
  }

  return loader(extraServiceTemplatesDir, data);
}

/** Load Redis extra-service block from template (BullMQ etc.); app connects via network. */
export async function loadRedisServiceBlock(
  extraServiceTemplatesDir: string,
  data: IDatabaseExtraServiceTemplateData,
): Promise<Record<string, unknown>> {
  const templatePath = path.join(extraServiceTemplatesDir, 'extra-service.redis.yml');
  const templateContent = await fs.readFile(templatePath, 'utf-8');
  const rendered = renderComposeTemplate(templateContent, {
    ...data,
  });
  return parseComposeToObject(rendered) as Record<string, unknown>;
}

export async function loadPostgresServiceBlock(
  extraServiceTemplatesDir: string,
  data: IDatabaseExtraServiceTemplateData,
): Promise<Record<string, unknown>> {
  const templatePath = path.join(extraServiceTemplatesDir, 'extra-service.postgres.yml');
  const templateContent = await fs.readFile(templatePath, 'utf-8');
  const rendered = renderComposeTemplate(templateContent, {
    ...data,
  });
  return parseComposeToObject(rendered) as Record<string, unknown>;
}

export async function loadMysqlServiceBlock(
  extraServiceTemplatesDir: string,
  data: IDatabaseExtraServiceTemplateData,
): Promise<Record<string, unknown>> {
  const templatePath = path.join(extraServiceTemplatesDir, 'extra-service.mysql.yml');
  const templateContent = await fs.readFile(templatePath, 'utf-8');
  const rendered = renderComposeTemplate(templateContent, {
    ...data,
  });
  return parseComposeToObject(rendered) as Record<string, unknown>;
}

export async function loadMongodbServiceBlock(
  extraServiceTemplatesDir: string,
  data: IDatabaseExtraServiceTemplateData,
): Promise<Record<string, unknown>> {
  const templatePath = path.join(extraServiceTemplatesDir, 'extra-service.mongodb.yml');
  const templateContent = await fs.readFile(templatePath, 'utf-8');
  const rendered = renderComposeTemplate(templateContent, {
    ...data,
  });
  return parseComposeToObject(rendered) as Record<string, unknown>;
}
