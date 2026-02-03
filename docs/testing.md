# Testing

Preview-deployer uses **Jest** for the orchestrator package. Tests are co-located with source (e.g. `project-slug.test.ts` next to `project-slug.ts`); E2E tests live under `orchestrator/tests/e2e/`.

## First-time test setup

E2E tests load env from **`orchestrator/.env.test`** (not `.env`). That file is not committed. Copy the example and fill in values as needed:

```bash
cp orchestrator/.env.test.example orchestrator/.env.test
# Edit orchestrator/.env.test: set GITHUB_TOKEN, GITHUB_WEBHOOK_SECRET, ALLOWED_REPOS, PREVIEW_BASE_URL for full E2E; optionally DOCKER_TEST_REPO_URL for DockerManager integration.
```

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

## Guidelines for writing tests

Use these so tests stay consistent and other agents can follow the same patterns.

### Layout and naming

- **Unit / integration**: Co-locate with source. Suffixes: `*.test.ts` (unit), `*.integration.test.ts` (integration). E2E: `orchestrator/tests/e2e/*.e2e.test.ts`.
- **Descriptive names**: Test names should describe behavior or outcome, not implementation (e.g. “should return 401 when signature is invalid”, not “should test validation”).

### Unit tests

- **Mock external deps**: Mock `fs`/`fs/promises`, logger, and other I/O so tests are fast and deterministic.
- **Mocking `fs/promises`**: Use a Jest factory so you can set implementations: `jest.mock('fs/promises', () => ({ access: jest.fn(), readFile: jest.fn() }))`. In tests use `fsMock.access.mockResolvedValue(...)` (do not reassign `fsMock.access = jest.fn()` — the module may have getter-only properties).
- **Tracked state**: Use temp files/dirs for code that reads or writes the filesystem (e.g. deployment tracker). Create a unique path per run (e.g. `path.join(os.tmpdir(), 'prefix-' + Date.now() + '-' + Math.random().toString(36).slice(2))`) and clean up in `afterEach`/`afterAll`.

### Integration tests

- **Temp dirs**: Use temp dirs for config, deployments, and DB paths; create and clean up in `beforeEach`/`afterEach` or `beforeAll`/`afterAll`.
- **NginxManager**: Pass `reloadCommand: async () => {}` so tests don’t need nginx or sudo. Assert only file contents and presence/absence of config files.
- **DockerManager**: Run the suite only when `DOCKER_TEST_REPO_URL` is set (e.g. `const describeIfRepo = process.env.DOCKER_TEST_REPO_URL ? describe : describe.skip`). Save the deployment to the tracker after `deployPreview` so `cleanupPreview` can find the work dir. Clean up in `afterAll`.

### E2E tests

- **Env**: E2E loads `orchestrator/.env.test` via `tests/setup-env.ts` (Jest e2e `setupFiles`). Do not rely on `.env` for E2E.
- **Stopping the app**: If the test uses `createApp`, call `stopScheduledCleanup()` in `afterEach` so the cleanup interval doesn’t keep the process alive and Jest can exit. Store the return value and call it in `afterEach`.
- **Webhook signature**: Sign the exact string the server will verify. The server uses `JSON.stringify(req.body)`. In the test: build the payload object, then `bodyString = JSON.stringify(payload)`, sign `bodyString`, and send the same object with `.send(payload)` so the server’s stringify matches.
- **Invalid-signature tests**: `crypto.timingSafeEqual` requires same-length buffers. Use a same-length invalid value (e.g. `'sha256=' + '0'.repeat(64)`) so the handler can return 401 instead of throwing.
- **Full E2E**: Skip unless `E2E_FULL=1` or `CI_FULL_E2E=1` (e.g. `const describeFull = runFullE2E ? describe : describe.skip`). Require env vars in `beforeAll` and fail fast with a clear message.

### General

- **Arrange–Act–Assert**: Structure tests as setup, action, then assertions.
- **One assertion per test** when it keeps tests clear; group related assertions in a single test when they describe one behavior.
- **Edge cases**: Cover boundaries (e.g. first allocation, duplicate allocation, invalid input) and error paths.
- **Production code**: Prefer dependency injection and small, pure functions so units can be tested without heavy mocking.

## Integration test details

- **NginxManager**: Writes config to a temp dir; reload is a no-op. No nginx binary or sudo required.
- **DockerManager**: Runs only when `DOCKER_TEST_REPO_URL` is set to a minimal public repo (e.g. one with a Dockerfile and `/health`). Clone, deploy, then cleanup. Example: `DOCKER_TEST_REPO_URL=https://github.com/owner/minimal-preview-app.git`.

## E2E full tier

E2E tests load env from **`orchestrator/.env.test`** (via `tests/setup-env.ts`), not `.env`. Copy `orchestrator/.env.test.example` to `orchestrator/.env.test` and set the required vars.

To run full E2E (real deploy and cleanup):

```bash
E2E_FULL=1 pnpm --filter @preview-deployer/orchestrator run test:e2e
```

In `.env.test` set `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `ALLOWED_REPOS` (e.g. `owner/repo`), and `PREVIEW_BASE_URL`. The test repo should have branch `main`, a Dockerfile, and a health endpoint (e.g. `/health`).

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
