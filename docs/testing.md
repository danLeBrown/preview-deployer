# Testing

Preview-deployer uses **Jest** for the orchestrator package. Tests are co-located with source (e.g. `project-slug.test.ts` next to `project-slug.ts`); E2E tests live under `orchestrator/tests/e2e/`.

## Running tests

From the repo root:

```bash
# Orchestrator unit tests (default)
pnpm --filter @preview-deployer/orchestrator run test:unit

# Unit + integration (no extra env; integration uses temp dirs, no nginx binary)
pnpm --filter @preview-deployer/orchestrator run test:all

# Integration only (Docker must be running for DockerManager tests)
pnpm --filter @preview-deployer/orchestrator run test:integration

# E2E API tier (no GitHub/Docker; mocked services)
pnpm --filter @preview-deployer/orchestrator run test:e2e

# With coverage
pnpm --filter @preview-deployer/orchestrator run test:coverage

# Watch mode
pnpm --filter @preview-deployer/orchestrator run test:watch
```

From `orchestrator/`:

```bash
pnpm test:unit
pnpm test:all          # unit + integration
pnpm test:integration  # requires Docker for DockerManager suite
pnpm test:e2e         # API tier always runs; full tier only when E2E_FULL=1
pnpm test:coverage
pnpm test:watch
```

## Test layers

- **Unit** (`*.test.ts`): Fast, no external services. Mocks fs, logger, etc. Run by default with `test:unit`. Excluded from build output.
- **Integration** (`*.integration.test.ts`): Real file I/O; NginxManager tests use a temp dir and no-op reload (no nginx binary). DockerManager integration tests run only when `DOCKER_TEST_REPO_URL` is set (see below).
- **E2E** (`tests/e2e/*.e2e.test.ts`):
  - **API tier** (`webhook-api.e2e.test.ts`): Full HTTP stack with mocked GitHub and Docker. No extra env; always runs with `test:e2e`.
  - **Full tier** (`webhook-full.e2e.test.ts`): Real GitHub client, real Docker, real clone and deploy. Skipped unless `E2E_FULL=1` or `CI_FULL_E2E=1`. Requires `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `ALLOWED_REPOS`, `PREVIEW_BASE_URL`, and a test repo with a minimal Dockerfile and health endpoint.

Integration and E2E are excluded from `test:unit`.

## Integration test details

- **NginxManager**: Writes config to a temp dir; reload is a no-op. No nginx binary or sudo required.
- **DockerManager**: Runs only when `DOCKER_TEST_REPO_URL` is set to a minimal public repo (e.g. one with a Dockerfile and `/health`). Clone, deploy, then cleanup. Example: `DOCKER_TEST_REPO_URL=https://github.com/owner/minimal-preview-app.git`.

## E2E full tier

To run full E2E (real deploy and cleanup):

```bash
E2E_FULL=1 pnpm --filter @preview-deployer/orchestrator run test:e2e
```

Set `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `ALLOWED_REPOS` (e.g. `owner/repo`), and `PREVIEW_BASE_URL`. The test repo should have branch `main`, a Dockerfile, and a health endpoint (e.g. `/health`).

## Current coverage

Unit tests cover:

- **project-slug** (project-slug-util): `toProjectSlug`, `toDeploymentId`
- **framework-detection**: NestJS/Go/Laravel detection, `resolveFramework` (mocked `fs/promises`)
- **deployment-tracker**: `allocatePorts`, `releasePorts`, get/save/delete deployment, `getAllDeployments`, `getDeploymentAge` (temp file store, mock logger)

Integration tests:

- **NginxManager**: `addPreview` writes path-based config and `proxy_pass`; `removePreview` deletes the file.
- **DockerManager** (when `DOCKER_TEST_REPO_URL` set): Deploy and cleanup with a real repo.

E2E API tier:

- Health, webhook (signed), list previews, delete preview, list empty; invalid signature returns 401.

After code changes, run `pnpm build` and orchestrator unit tests before considering work done (see [.cursor/rules/preview-deployer-standards.mdc](../.cursor/rules/preview-deployer-standards.mdc)).
