# Preview Deployer System - Implementation Plan

This is the canonical implementation plan for the project. It is synced from the Cursor plan and committed so all contributors and agents use the same reference.

## Architecture Overview

The system follows a layered architecture:

```
GitHub Webhook → Orchestrator API → Docker Containers → Nginx Reverse Proxy → Preview URLs
```

**Key Components:**

- **Terraform**: Provisions Digital Ocean droplet with networking and security
- **Ansible**: Configures server with Docker, nginx, and orchestrator service
- **Orchestrator**: TypeScript service handling webhooks, Docker management, nginx config, and cleanup
- **CLI**: User-facing tool for setup, management, and teardown
- **Templates**: Docker Compose and nginx config templates for preview environments

## Project Structure

```
preview-deployer/
├── terraform/          # Infrastructure as Code
├── ansible/            # Server configuration
├── orchestrator/       # Core deployment service
├── cli/                # Command-line interface
├── templates/          # User-facing templates
├── docs/               # Documentation
└── scripts/            # Utility scripts
```

## Implementation Notes (Lessons Learned)

- **Workspace TypeScript**: Package `tsconfig.json` should use `"extends": "../tsconfig.json"` (one level up from the package), not `"../../tsconfig.json"`.
- **Deployment tracker I/O**: Use **sync** `fs` for hot paths (`getDeployment`, `getAllDeployments`, `allocatePorts`); **async** `fs/promises` for persistence.
- **Dockerode types**: No maintained `@types/dockerode`. Use a local declaration or `// @ts-ignore`; document in orchestrator README.
- **Optional native deps**: `keytar` may fail to build; keychain storage is optional; fallback to config file is acceptable for v1.
- **Strict TypeScript**: Watch for variables used before assignment, "not all code paths return a value" in route handlers, and unused parameters (prefix with `_`).
- **Nginx**: Preview configs must be included **inside** a default `server { }` block; `location` blocks are not valid at `http` level.

## Key Implementation Details

- **Project slug**: Derived from repo `owner/name` (e.g. `myorg-myapp`). Used to avoid collisions when multiple repos have the same PR number.
- **Deployment id**: `{projectSlug}-{prNumber}` (e.g. `myorg-myapp-12`). Single key for tracker, nginx config filenames, and compose project name.
- **Port allocation**: Global pool; next free app port from 8000, next free db port from 9000. Keyed by deployment id. Allocation excludes host ports currently bound by running Docker containers (so failed deployments whose containers still run do not cause port collisions).
- **Routing**: Path-based `/{projectSlug}/pr-{number}/`; nginx proxies to `http://localhost:{appPort}/`.
- **Deployment tracking**: JSON file at `/opt/preview-deployer/deployments.json`; keys are deployment ids; atomic file operations.

For the full plan (phases, roles, validation checkpoints, testing), see the Cursor plan or the rest of this doc. This file is the single source of truth for architecture and implementation standards.
