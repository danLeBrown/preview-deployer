# Orchestrator Service

Core orchestrator service for managing preview deployments.

## Features

- GitHub webhook handling
- Docker container management
- Nginx configuration management
- Automatic cleanup of stale deployments
- Deployment tracking

## Environment Variables

- `GITHUB_TOKEN`: GitHub personal access token
- `GITHUB_WEBHOOK_SECRET`: Secret for webhook signature verification
- `ALLOWED_REPOS`: Comma-separated list of allowed repositories (format: owner/repo)
- `PREVIEW_BASE_URL`: Base URL for preview links
- `CLEANUP_TTL_DAYS`: TTL for preview deployments (default: 7)
- `ORCHESTRATOR_PORT`: Port for the orchestrator API (default: 3000)
- `DEPLOYMENTS_DIR`: Directory for preview deployments (default: /opt/preview-deployments)
- `NGINX_CONFIG_DIR`: Directory for nginx preview configs (default: /etc/nginx/preview-configs)
- `DEPLOYMENTS_DB`: Path to deployments database file (default: /opt/preview-deployer/deployments.json)
- `LOG_LEVEL`: Logging level (default: info)

## API Endpoints

### Health Check

```
GET /health
```

Returns server status and uptime.

### GitHub Webhook

```
POST /webhook/github
```

Handles GitHub webhook events for pull requests.

### List Previews

```
GET /api/previews
```

Returns list of all active preview deployments.

### Delete Preview

```
DELETE /api/previews/:deploymentId
```

Manually cleanup a preview deployment. `deploymentId` is `{projectSlug}-{prNumber}` (e.g. `myorg-myapp-12`).

### API documentation

- **OpenAPI JSON**: `GET /openapi.json` — OpenAPI 3.0 spec for the API (for doc sites or tooling).
- **Swagger UI**: `GET /api-docs` — Interactive API docs.

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run in development mode
pnpm dev

# Run in production mode
pnpm start
```

## Deployment

The orchestrator is deployed via Ansible. See the `ansible/roles/orchestrator` role for deployment configuration.
