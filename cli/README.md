# Preview Deployer CLI

Command-line interface for managing preview-deployer infrastructure and deployments.

## Installation

```bash
pnpm install
pnpm build
```

## Commands

### init

Initialize preview-deployer configuration.

```bash
preview init
```

This will prompt for:
- Digital Ocean API token
- GitHub personal access token
- Repository configuration
- Infrastructure settings

### setup

Set up infrastructure and deploy orchestrator.

```bash
preview setup
```

This will:
1. Initialize Terraform
2. Provision Digital Ocean droplet
3. Configure server with Ansible
4. Create GitHub webhooks

### status

Check deployment status.

```bash
preview status
```

Shows:
- Infrastructure status
- Orchestrator health
- Active preview deployments

### destroy

Destroy all infrastructure and cleanup.

```bash
preview destroy
```

This will:
1. Cleanup all preview deployments
2. Delete GitHub webhooks
3. Destroy Terraform infrastructure

## Configuration

Configuration is stored in `~/.preview-deployer/config.yml`. Sensitive values (tokens) are stored in the OS keychain.
