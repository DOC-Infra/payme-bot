import { join } from 'node:path';
import { rootDir } from './lib/constants';

export interface Config {
	discordToken: string;
	/** Where each server's database is kept, one file per server. */
	dataDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	if (!env.DISCORD_TOKEN) throw new Error('Missing required environment variable: DISCORD_TOKEN');
	return { discordToken: env.DISCORD_TOKEN, dataDir: env.DATA_DIR || join(rootDir, 'data') };
}
