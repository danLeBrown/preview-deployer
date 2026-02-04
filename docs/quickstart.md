# Quickstart Guide

Get preview-deployer up and running in minutes.

## Prerequisites

Before you begin, ensure you have:

1. **Digital Ocean Account**: Sign up at [digitalocean.com](https://www.digitalocean.com)
2. **GitHub Account**: With access to repositories you want to enable
3. **Node.js**: Version 20 or higher ([download](https://nodejs.org))
4. **pnpm**: Package manager ([install](https://pnpm.io/installation))
5. **Terraform**: Version 1.5 or higher ([install](https://www.terraform.io/downloads))
6. **Ansible**: Version 2.14 or higher ([install](https://docs.ansible.com/ansible/latest/installation_guide/index.html))
7. **SSH Key**: For accessing the Digital Ocean droplet

## Step 1: Install preview-deployer

Clone the repository and install dependencies:

```bash
git clone https://github.com/danLeBrown/preview-deployer.git
cd preview-deployer
pnpm install
pnpm build
```

## Step 2: Get Required Tokens

### Digital Ocean API Token

1. Go to [Digital Ocean API Tokens](https://cloud.digitalocean.com/account/api/tokens)
2. Click "Generate New Token"
3. Give it a name (e.g., "preview-deployer")
4. Select "Write" scope
5. Copy the token (you won't see it again!)

### GitHub Personal Access Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a name (e.g., "preview-deployer")
4. Select scopes:
   - `repo` (Full control of private repositories)
   - `admin:repo_hook` (Full control of repository hooks)
5. Generate and copy the token

## Step 3: Initialize Configuration

Run the init command:

```bash
pnpm --filter cli run build
preview init
```

You'll be prompted for:

- Digital Ocean API token
- Digital Ocean region (default: nyc3)
- Droplet size (default: s-2vcpu-4gb)
- GitHub personal access token
- GitHub repositories (comma-separated, format: owner/repo)
- Cleanup TTL in days (default: 7)
- Max concurrent previews (default: 10)

Configuration is saved to `~/.preview-deployer/config.yml`. Sensitive values are stored in your OS keychain.

## Step 4: Prepare Your Repository

Add a `preview-config.yml` file to your repository root:

```yaml
framework: nestjs # or 'go'
database: postgres
health_check_path: /health
```

See [Configuration Reference](configuration.md) for all options.

Ensure your application has a health check endpoint at the specified path.

## Step 5: Set Up Infrastructure

Run the setup command:

```bash
preview setup
```

This will:

1. Provision a Digital Ocean droplet
2. Configure the server with Docker, nginx, and the orchestrator
3. Create GitHub webhooks for your repositories

You'll be prompted for:

- SSH public key (for droplet access)
- Confirmation to create infrastructure

The setup process takes about 5-10 minutes.

## Step 6: Test It Out

1. Create a new branch in your repository
2. Make some changes
3. Open a pull request
4. Wait 2-3 minutes for the preview to deploy
5. Check the PR comments for the preview URL

The preview URL will be in the format: `http://YOUR_SERVER_IP/{projectSlug}/pr-{PR_NUMBER}/` (e.g. `http://YOUR_SERVER_IP/myorg-myapp/pr-12/`).

## Step 7: Verify Deployment

Check the status:

```bash
preview status
```

This shows:

- Infrastructure status
- Orchestrator health
- Active preview deployments

## Troubleshooting

If something goes wrong:

1. Check the orchestrator logs:

   ```bash
   ssh root@YOUR_SERVER_IP
   journalctl -u preview-deployer-orchestrator -f
   ```

2. Check Docker containers:

   ```bash
   ssh root@YOUR_SERVER_IP
   docker ps -a
   docker logs {projectSlug}-pr-123-app  # Replace with your project slug and PR number
   ```

3. Check nginx configuration:
   ```bash
   ssh root@YOUR_SERVER_IP
   nginx -t
   cat /etc/nginx/preview-configs/{projectSlug}-pr-123.conf
   ```

See [Troubleshooting Guide](troubleshooting.md) for more help.

## Next Steps

- Read the [Architecture Documentation](architecture.md) to understand how it works
- Customize your [Configuration](configuration.md)
- Set up monitoring and alerts
- Configure custom domains (future feature)

## Cost Estimation

Default setup costs approximately:

- Digital Ocean droplet (s-2vcpu-4gb): ~$24/month
- Reserved IP: Free
- Firewall: Free
- Monitoring: Free

**Total: ~$24/month**

You can reduce costs by:

- Using a smaller droplet (s-1vcpu-2gb: ~$12/month)
- Using a cheaper region
- Disabling backups

## Cleanup

To destroy all infrastructure:

```bash
preview destroy
```

This will:

1. Cleanup all preview deployments
2. Delete GitHub webhooks
3. Destroy the Digital Ocean droplet

**Warning**: This is irreversible!
