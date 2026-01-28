output "server_ip" {
  description = "Public IPv4 address of the droplet"
  value       = digitalocean_reserved_ip.preview_deployer.ip_address
}

output "droplet_id" {
  description = "ID of the created droplet"
  value       = digitalocean_droplet.preview_deployer.id
}

output "server_ssh_user" {
  description = "SSH user for connecting to the droplet"
  value       = "root"
}

output "reserved_ip" {
  description = "Reserved IP address assigned to the droplet"
  value       = digitalocean_reserved_ip.preview_deployer.ip_address
}
