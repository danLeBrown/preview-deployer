#!/bin/bash

# Quick setup script for preview-deployer
# This script automates the initial setup process

set -e

echo "🚀 Preview Deployer Quick Setup"
echo "================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Abort."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm is required but not installed. Abort."; exit 1; }
command -v terraform >/dev/null 2>&1 || { echo "❌ Terraform is required but not installed. Abort."; exit 1; }
command -v ansible-playbook >/dev/null 2>&1 || { echo "❌ Ansible is required but not installed. Abort."; exit 1; }

echo "✅ All prerequisites met"
echo ""

# Install dependencies
echo "Installing dependencies..."
pnpm install
echo "✅ Dependencies installed"
echo ""

# Build projects
echo "Building projects..."
pnpm build
echo "✅ Projects built"
echo ""

# Run init if config doesn't exist
if [ ! -f ~/.preview-deployer/config.yml ]; then
    echo "Running initialization..."
    echo "Please follow the prompts to configure preview-deployer"
    echo ""
    node cli/dist/index.js init
    echo ""
else
    echo "✅ Configuration already exists"
    echo ""
fi

echo "Setup complete! Next steps:"
echo "1. Review your configuration: ~/.preview-deployer/config.yml"
echo "2. Run 'preview setup' to deploy infrastructure"
echo "3. Create a PR in your repository to test"
echo ""
