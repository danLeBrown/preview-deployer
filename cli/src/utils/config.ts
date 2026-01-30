import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import * as keytar from 'keytar';

export interface Config {
  digitalocean: {
    token: string;
    region: string;
    droplet_size: string;
    alert_email: string;
  };
  github: {
    token: string;
    webhook_secret: string;
    repositories: string[];
  };
  orchestrator: {
    cleanup_ttl_days: number;
    max_concurrent_previews: number;
  };
}

const CONFIG_DIR = path.join(os.homedir(), '.preview-deployer');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yml');
const SERVICE_NAME = 'preview-deployer';

export class ConfigManager {
  static ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  static async loadConfig(): Promise<Config | null> {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }

    const configContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = yaml.load(configContent) as Partial<Config>;

    // Load sensitive values from keychain
    if (config.digitalocean?.token === 'keychain') {
      const token = await keytar.getPassword(SERVICE_NAME, 'do_token');
      if (token) {
        config.digitalocean.token = token;
      }
    }

    if (config.github?.token === 'keychain') {
      const token = await keytar.getPassword(SERVICE_NAME, 'github_token');
      if (token) {
        config.github.token = token;
      }
    }

    return config as Config;
  }

  static async saveConfig(config: Config): Promise<void> {
    this.ensureConfigDir();

    // Store sensitive values in keychain
    await keytar.setPassword(SERVICE_NAME, 'do_token', config.digitalocean.token);
    await keytar.setPassword(SERVICE_NAME, 'github_token', config.github.token);

    // Create config copy with keychain placeholders
    const configToSave = {
      ...config,
      digitalocean: {
        ...config.digitalocean,
        token: 'keychain',
      },
      github: {
        ...config.github,
        token: 'keychain',
      },
    };

    const yamlContent = yaml.dump(configToSave, { indent: 2 });
    fs.writeFileSync(CONFIG_FILE, yamlContent, 'utf-8');
  }

  static validateConfig(config: Partial<Config>): string[] {
    const errors: string[] = [];

    if (!config.digitalocean?.token) {
      errors.push('Digital Ocean token is required');
    }
    if (!config.github?.token) {
      errors.push('GitHub token is required');
    }
    if (!config.github?.webhook_secret) {
      errors.push('GitHub webhook secret is required');
    }
    if (!config.github?.repositories || config.github.repositories.length === 0) {
      errors.push('At least one GitHub repository is required');
    }
    if (!config.digitalocean?.region) {
      errors.push('Digital Ocean region is required');
    }
    if (!config.digitalocean?.droplet_size) {
      errors.push('Digital Ocean droplet size is required');
    }

    return errors;
  }

  static getConfigPath(): string {
    return CONFIG_FILE;
  }
}
