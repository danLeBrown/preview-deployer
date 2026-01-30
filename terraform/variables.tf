variable "do_token" {
  description = "Digital Ocean API token"
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "SSH public key for droplet access"
  type        = string
  sensitive   = false
}

variable "region" {
  description = "Digital Ocean region for droplet"
  type        = string
  default     = "nyc3"
}

variable "droplet_size" {
  description = "Digital Ocean droplet size"
  type        = string
  # default     = "s-2vcpu-4gb"
  default     = "s-2vcpu-2gb"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "preview-deployer"
}

variable "alert_email" {
  description = "Email address for alerts"
  type        = string
  default     = "ayomidedaniel00@gmail.com"
}