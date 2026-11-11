import { join } from 'node:path';
import { rootDir } from './lib/constants';

export interface Config {
	discordToken: string;
	guildId: string;
	leadershipRoleId: string;
	employeeChannelCategoryId: string;
	databasePath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const missing: string[] = [];
	const read = (name: string) => {
		const value = env[name];
		if (!value) missing.push(name);
		return value ?? '';
	};

	const config: Config = {
		discordToken: read('DISCORD_TOKEN'),
		guildId: read('GUILD_ID'),
		leadershipRoleId: read('LEADERSHIP_ROLE_ID'),
		employeeChannelCategoryId: read('EMPLOYEE_CHANNEL_CATEGORY_ID'),
		databasePath: env.DATABASE_PATH || join(rootDir, 'payme.db')
	};

	if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
	return config;
}
