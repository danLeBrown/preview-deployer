/**
 * OpenAPI 3.0 spec for the orchestrator API. Served at GET /openapi.json and used by Swagger UI at /api-docs.
 * Kept in sync with routes in app.ts.
 */

export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, unknown>;
  components?: { schemas?: Record<string, unknown> };
}

function buildSpec(baseUrl?: string): OpenAPISpec {
  const servers = baseUrl ? [{ url: baseUrl, description: 'Orchestrator API' }] : undefined;

  return {
    openapi: '3.0.3',
    info: {
      title: 'Preview Deployer Orchestrator API',
      version: '0.1.0',
      description:
        'API for the preview deployer orchestrator: health checks, GitHub webhook, and preview lifecycle (list/delete).',
    },
    servers,
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          description: 'Returns service health status and uptime.',
          operationId: 'getHealth',
          tags: ['Health'],
          responses: {
            200: {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
          },
        },
      },
      '/webhook/github': {
        post: {
          summary: 'GitHub webhook',
          description:
            // eslint-disable-next-line max-len
            'Receives GitHub pull_request webhook events (opened, reopened, synchronize, closed). Requires X-Hub-Signature-256 header. Payload follows GitHub webhook payload format.',
          operationId: 'postWebhookGitHub',
          tags: ['Webhook'],
          parameters: [
            {
              name: 'x-hub-signature-256',
              in: 'header',
              required: true,
              description: 'HMAC-SHA256 signature of the request body using the webhook secret.',
              schema: { type: 'string', example: 'sha256=...' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GitHubWebhookPayload' },
              },
            },
          },
          responses: {
            200: {
              description: 'Webhook processed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { status: { type: 'string', example: 'ok' } },
                  },
                },
              },
            },
            401: {
              description: 'Invalid signature',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            500: {
              description: 'Webhook handling failed',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/previews': {
        get: {
          summary: 'List preview deployments',
          description: 'Returns all tracked preview deployments.',
          operationId: 'listPreviews',
          tags: ['Previews'],
          responses: {
            200: {
              description: 'List of deployments',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DeploymentsList' },
                },
              },
            },
            500: {
              description: 'Failed to list deployments',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/previews/{deploymentId}': {
        delete: {
          summary: 'Delete a preview deployment',
          description:
            'Stops and removes the preview for the given deployment id (format: {projectSlug}-{prNumber}, e.g. myorg-myapp-12).',
          operationId: 'deletePreview',
          tags: ['Previews'],
          parameters: [
            {
              name: 'deploymentId',
              in: 'path',
              required: true,
              description: 'Deployment id (projectSlug-prNumber)',
              schema: { type: 'string', example: 'myorg-myapp-12' },
            },
          ],
          responses: {
            200: {
              description: 'Preview cleaned up',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Invalid deployment id',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            404: {
              description: 'Deployment not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            500: {
              description: 'Cleanup failed',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        HealthResponse: {
          type: 'object',
          required: ['status', 'timestamp', 'uptime'],
          properties: {
            status: { type: 'string', example: 'ok' },
            timestamp: { type: 'string', format: 'date-time', description: 'ISO 8601 timestamp' },
            uptime: { type: 'number', description: 'Process uptime in seconds' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Error message' },
          },
        },
        Deployment: {
          type: 'object',
          description: 'Preview deployment info; aligns with IDeploymentInfo.',
          properties: {
            prNumber: { type: 'integer' },
            repoName: { type: 'string' },
            repoOwner: { type: 'string' },
            projectSlug: { type: 'string', description: 'Slug from owner/name (e.g. myorg-myapp)' },
            deploymentId: { type: 'string', description: 'projectSlug-prNumber' },
            branch: { type: 'string' },
            commitSha: { type: 'string' },
            framework: { type: 'string', enum: ['nestjs', 'go', 'laravel', 'rust', 'python'] },
            dbType: { type: 'string', enum: ['postgres', 'mysql', 'mongodb'] },
            appPort: { type: 'integer' },
            exposedAppPort: { type: 'integer' },
            exposedDbPort: { type: 'integer' },
            status: { type: 'string', enum: ['building', 'running', 'failed', 'stopped'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            url: { type: 'string', description: 'Preview URL', nullable: true },
            commentId: { type: 'integer', nullable: true },
          },
        },
        DeploymentsList: {
          type: 'object',
          required: ['deployments'],
          properties: {
            deployments: {
              type: 'array',
              items: { $ref: '#/components/schemas/Deployment' },
            },
          },
        },
        GitHubWebhookPayload: {
          type: 'object',
          description:
            'GitHub pull_request webhook payload. See https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request',
          required: ['action', 'pull_request', 'repository'],
          properties: {
            action: { type: 'string', enum: ['opened', 'reopened', 'synchronize', 'closed'] },
            pull_request: {
              type: 'object',
              required: ['number', 'head', 'base'],
              properties: {
                number: { type: 'integer' },
                head: {
                  type: 'object',
                  properties: {
                    ref: { type: 'string' },
                    sha: { type: 'string' },
                    repo: {
                      type: 'object',
                      properties: {
                        clone_url: { type: 'string' },
                        name: { type: 'string' },
                        owner: { type: 'object', properties: { login: { type: 'string' } } },
                      },
                    },
                  },
                },
                base: { type: 'object', properties: { ref: { type: 'string' } } },
              },
            },
            repository: {
              type: 'object',
              required: ['full_name', 'name', 'owner'],
              properties: {
                full_name: { type: 'string' },
                name: { type: 'string' },
                owner: { type: 'object', properties: { login: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  };
}

/**
 * Returns the OpenAPI 3.0 spec. Pass an optional base URL (e.g. from PREVIEW_BASE_URL or ORCHESTRATOR_PUBLIC_URL)
 * to set the spec's servers[].url for the doc site or Swagger UI.
 */
export function getOpenApiSpec(baseUrl?: string): OpenAPISpec {
  return buildSpec(baseUrl);
}
