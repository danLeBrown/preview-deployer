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

See [docs/quickstart.md](docs/quickstart.md) for detailed setup instructions.

```bash
# Install dependencies
pnpm install

# Initialize configuration
pnpm --filter cli run build
preview init

# Deploy infrastructure
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

See [docs/testing.md](docs/testing.md) for integration, E2E, coverage, and env vars.

## Documentation

- [Quickstart Guide](docs/quickstart.md) - Get started in minutes
- [Architecture](docs/architecture.md) - System design and components
- [Configuration](docs/configuration.md) - Configuration reference
- [Testing](docs/testing.md) - Running tests and coverage
- [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT
