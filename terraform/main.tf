terraform {
  required_version = ">= 1.5.0"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

provider "digitalocean" {
  token = var.do_token
}

# SSH Key Resource
resource "digitalocean_ssh_key" "preview_deployer" {
  name       = "${var.project_name}-ssh-key"
  public_key = var.ssh_public_key
}

# Firewall Rules
resource "digitalocean_firewall" "preview_deployer" {
  name = "${var.project_name}-firewall"

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  tags = [digitalocean_tag.preview_deployer.id]
}

# Tag for resource management
resource "digitalocean_tag" "preview_deployer" {
  name = var.project_name
}

# Reserved IP (optional but recommended for stability)
resource "digitalocean_reserved_ip" "preview_deployer" {
  region = var.region
}

# Droplet Resource
resource "digitalocean_droplet" "preview_deployer" {
  image    = "ubuntu-22-04-x64"
  name     = "${var.project_name}-server"
  region   = var.region
  size     = var.droplet_size
  ssh_keys = [digitalocean_ssh_key.preview_deployer.id]
  tags     = [digitalocean_tag.preview_deployer.id]

  # Enable monitoring
  monitoring = true

  # Enable backups (optional, can be disabled to save costs)
  backups = false

  # User data script for initial setup (optional)
  user_data = <<-EOF
    #!/bin/bash
    apt-get update
    apt-get install -y curl wget git
  EOF
}

resource "digitalocean_monitor_alert" "preview_deployer_cpu_alert" {
  alerts {
    email = [var.alert_email]
    # slack {
    #   channel = "Production Alerts"
    #   url     = "https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ"
    # }
  }
  window      = "5m"
  type        = "v1/insights/droplet/cpu"
  compare     = "GreaterThan"
  value       = 95
  enabled     = true
  entities    = [digitalocean_droplet.preview_deployer.id]
  description = "Alert about CPU usage"
}

# Assign reserved IP to droplet
resource "digitalocean_reserved_ip_assignment" "preview_deployer" {
  ip_address = digitalocean_reserved_ip.preview_deployer.ip_address
  droplet_id = digitalocean_droplet.preview_deployer.id
}
