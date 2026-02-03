# Testing

Preview-deployer uses **Jest** for the orchestrator package. Tests are co-located with source (e.g. `project-slug.test.ts` next to `project-slug.ts`).

## Running tests

From the repo root:

```bash
# Orchestrator unit tests (default)
pnpm --filter @preview-deployer/orchestrator run test:unit

# With coverage
pnpm --filter @preview-deployer/orchestrator run test:coverage

# Watch mode
pnpm --filter @preview-deployer/orchestrator run test:watch
```

From `orchestrator/`:

```bash
pnpm test:unit
pnpm test:coverage
pnpm test:integration   # requires Docker
pnpm test:e2e           # full lifecycle; optional
```

## Test layers

- **Unit** (`*.test.ts`): Fast, no external services. Mocks fs, logger, etc. Run by default with `test:unit`.
- **Integration** (`*.integration.test.ts`): Real Docker/nginx; longer timeouts, serial execution.
- **E2E** (`tests/e2e/*.e2e.test.ts`): Full PR lifecycle; optional, for CI or manual runs.

## Current coverage

Unit tests cover:

- **project-slug**: `toProjectSlug`, `toDeploymentId`
- **framework-detection**: NestJS/Go/Laravel detection, `resolveFramework` (mocked `fs/promises`)
- **deployment-tracker**: `allocatePorts`, `releasePorts`, get/save/delete deployment, `getAllDeployments`, `getDeploymentAge` (temp file store, mock logger)

After code changes, run `pnpm build` and orchestrator unit tests before considering work done (see [.cursor/rules/preview-deployer-standards.mdc](../.cursor/rules/preview-deployer-standards.mdc)).
