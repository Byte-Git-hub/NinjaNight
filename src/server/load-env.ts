import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

/** Load before importing server config; injected deployment variables take precedence. */
const localEnv = resolve(process.cwd(), '.env.local');
if (existsSync(localEnv)) loadEnvFile(localEnv);
