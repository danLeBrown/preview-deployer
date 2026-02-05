# Terraform Configuration

This directory contains Terraform configuration files for provisioning the Digital Ocean infrastructure required for Prvue.

## Prerequisites

- Terraform >= 1.5.0
- Digital Ocean API token
- SSH public key

## Variables

Create a `terraform.tfvars` file (or use environment variables) with the following:

```hcl
do_token       = "your-digital-ocean-api-token"
ssh_public_key = "ssh-rsa AAAA..."
region         = "nyc3"
droplet_size   = "s-2vcpu-4gb"
project_name   = "preview-deployer"
```

### Variable Descriptions

- `do_token`: Your Digital Ocean API token (sensitive)
- `ssh_public_key`: Your SSH public key for accessing the droplet
- `region`: Digital Ocean region (default: "nyc3")
- `droplet_size`: Droplet size slug (default: "s-2vcpu-2gb")
- `project_name`: Project name for resource tagging (default: "preview-deployer")

## Usage

### Initialize Terraform

```bash
terraform init
```

### Plan Infrastructure

```bash
terraform plan
```

### Apply Infrastructure

```bash
terraform apply
```

### Destroy Infrastructure

```bash
terraform destroy
```

## Outputs

After applying, Terraform will output:

- `server_ip`: Public IPv4 address of the droplet
- `droplet_id`: ID of the created droplet
- `server_ssh_user`: SSH user (root)
- `reserved_ip`: Reserved IP address

## Resources Created

- **Droplet**: Ubuntu 22.04 server with specified size
- **SSH Key**: SSH key resource for secure access
- **Firewall**: Firewall rules for SSH (22), HTTP (80), HTTPS (443)
- **Reserved IP**: Static IP address for stability
- **Tag**: Resource tag for management

## Security Notes

- The firewall allows SSH from any IP (0.0.0.0/0). Consider restricting this in production.
- The reserved IP ensures the server IP doesn't change if the droplet is recreated.
- All resources are tagged for easy identification and cleanup.

## Cost Considerations

- Default droplet size: `s-2vcpu-4gb` (~$24/month)
- Reserved IP: Free (as long as it's assigned to a droplet)
- Firewall: Free
- Monitoring: Free

To reduce costs, you can:

- Use a smaller droplet size (e.g., `s-1vcpu-2gb`)
- Disable backups (already disabled by default)
- Use a cheaper region
