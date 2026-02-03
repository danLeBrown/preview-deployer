/**
 * Load .env.test before E2E tests so full E2E has GITHUB_TOKEN, ALLOWED_REPOS, etc.
 * Run by Jest e2e config via setupFiles.
 */
import * as path from 'path';

import dotenv from 'dotenv';

const envTestPath = path.resolve(__dirname, '..', '.env.test');
dotenv.config({ path: envTestPath });
