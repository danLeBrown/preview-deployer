# Preview Deployer

Automated preview deployment system for backend applications (NestJS and Go) that creates isolated preview environments on Digital Ocean when GitHub PRs are opened, similar to how Vercel/Netlify work for frontend apps.

## Features

- 🚀 **Automatic Preview Environments**: Creates isolated Docker containers for each PR
- 🗄️ **Database Isolation**: Each preview gets its own database instance
- 🔄 **Auto Updates**: Preview environments rebuild automatically on PR updates
- 🧹 **Auto Cleanup**: Removes preview environments when PRs are closed or after TTL expires
- 🌐 **Nginx Routing**: Path-based routing (`/{projectSlug}/pr-{number}/`) to preview environments (project slug from repo owner/name avoids collisions across repos)
- 📦 **Infrastructure as Code**: Terraform for provisioning, Ansible for configuration
- 🛠️ **CLI Tool**: Simple command-line interface for setup and management
- 🔒 **Secure**: Webhook signature verification, repository whitelisting, input sanitization

## Architecture

```
GitHub Webhook → Orchestrator API → Docker Containers → Nginx Reverse Proxy → Preview URLs
```

**Key Components:**

- **Terraform**: Provisions Digital Ocean droplet with networking and security
- **Ansible**: Configures server with Docker, nginx, and orchestrator service
- **Orchestrator**: TypeScript service handling webhooks, Docker management, nginx config, and cleanup
- **CLI**: User-facing tool for setup, management, and teardown

## Quick Start

See the [Quickstart guide](https://docs.prvue.dev/quickstart) for detailed setup instructions.

```bash
# Install dependencies
pnpm install

# Build (required before using the CLI)
pnpm build

# Option A: Use the CLI from the repo (no global install)
pnpm preview init
pnpm preview setup

# Option B: Link the CLI globally so you can run `preview` from anywhere
pnpm link --global -C cli
preview init
preview setup

# Create a PR in your repository to trigger a preview deployment
```

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

## Supported Frameworks

- **NestJS** (primary)
- **Go** (secondary)

## Supported Databases

- **PostgreSQL** (primary)
- Architecture supports MySQL/MongoDB (future)

## Testing

```bash
pnpm --filter @preview-deployer/orchestrator run test:unit   # unit only
pnpm --filter @preview-deployer/orchestrator run test:all    # unit + integration
pnpm --filter @preview-deployer/orchestrator run test:e2e    # E2E API tier (optional full tier with E2E_FULL=1)
```

See [Testing](https://docs.prvue.dev/testing) for integration, E2E, coverage, and env vars.

## Documentation

Documentation is published at **[docs.prvue.dev](https://docs.prvue.dev)** (Mintlify). For local development, run `mintlify dev` in the docs repo.

- [Quickstart](https://docs.prvue.dev/quickstart) – Get started in minutes
- [Architecture](https://docs.prvue.dev/architecture) – System design and components
- [Configuration](https://docs.prvue.dev/configuration) – Configuration reference
- [Examples](https://docs.prvue.dev/examples) – NestJS, Laravel, Go, Python, and Rust example repos
- [Testing](https://docs.prvue.dev/testing) – Running tests and coverage
- [Troubleshooting](https://docs.prvue.dev/troubleshooting) – Common issues and solutions

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT
