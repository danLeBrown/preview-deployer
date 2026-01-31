# Ansible Configuration

This directory contains Ansible playbooks and roles for configuring the preview-deployer server.

## Prerequisites

- Ansible >= 2.14
- SSH access to the provisioned droplet
- Python 3 on the target server

## Structure

```
ansible/
├── playbook.yml          # Main playbook
├── ansible.cfg           # Ansible configuration
├── inventory.ini         # Inventory file (populated from Terraform)
└── roles/
    ├── docker/           # Docker installation and configuration
    ├── nginx/            # Nginx installation and configuration
    └── orchestrator/     # Orchestrator service deployment
```

## Roles

### Docker Role

Installs Docker CE and Docker Compose plugin, creates deployment user, and configures Docker daemon logging limits.

### Nginx Role

Installs nginx, creates directory structure for preview configs, and deploys base nginx configuration with preview-configs include.

### Orchestrator Role

Deploys the orchestrator service:
- Installs Node.js via NVM (for the deployment user)
- When `orchestrator_source == "local"`: builds on the **controller** (your machine), then syncs source + built `dist/`; server only runs `npm install --omit=dev` (no TypeScript build on server — "build once, deploy everywhere")
- When `orchestrator_source == "git"`: clones repo and builds on the server (requires dev deps there)
- Creates systemd service, log rotation, and environment

**Build strategy:** For local source, the playbook builds the orchestrator on the machine running Ansible (Node/npm required there), then rsync includes `dist/`. The server never runs `tsc` and only installs production dependencies. For a future "orchestrator in Docker" flow, you would build an image (multi-stage Dockerfile) and run the container on the server instead.

## Usage

### Generate Inventory from Terraform

First, get the server IP from Terraform outputs:

```bash
cd terraform
terraform output -raw server_ip > ../ansible/server_ip.txt
```

Then update `inventory.ini`:

```ini
[preview_deployer]
<server_ip> ansible_user=root ansible_ssh_private_key_file=~/.ssh/id_rsa
```

### Run Playbook

```bash
ansible-playbook -i inventory.ini playbook.yml \
  -e "github_token=your_token" \
  -e "github_webhook_secret=your_secret" \
  -e "allowed_repos=owner/repo1,owner/repo2" \
  -e "server_ip=$(cat server_ip.txt)"
```

### Required Variables

- `github_token`: GitHub personal access token
- `github_webhook_secret`: Secret for webhook signature verification
- `allowed_repos`: Comma-separated list of allowed repositories (format: owner/repo)
- `server_ip`: Public IP of the droplet

### Optional Variables

- `orchestrator_source`: "local" (default) or "git"
- `orchestrator_repo_url`: Repository URL if using git source
- `orchestrator_repo_branch`: Branch name (default: "main")
- `cleanup_ttl_days`: TTL for preview deployments (default: 7)
- `max_concurrent_previews`: Maximum concurrent previews (default: 10)
- `preview_base_url`: Base URL for preview links (default: http://server_ip)

## Verification

After running the playbook, verify services:

```bash
# Check Docker
ssh root@<server_ip> docker --version

# Check nginx
ssh root@<server_ip> systemctl status nginx

# Check orchestrator
ssh root@<server_ip> systemctl status preview-deployer-orchestrator
curl http://<server_ip>:3000/health
```

## Troubleshooting

- If SSH connection fails, ensure your SSH key is added to the droplet
- If nginx fails to start, check configuration: `nginx -t`
- If orchestrator fails, check logs: `journalctl -u preview-deployer-orchestrator -f`
- Check orchestrator logs: `/opt/preview-deployer/logs/orchestrator.log`
