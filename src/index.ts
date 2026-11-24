import './lib/setup';

import { container, LogLevel, SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits } from 'discord.js';
import { loadConfig } from './env';

const config = loadConfig();
container.config = config;

const client = new SapphireClient({
	defaultPrefix: '!',
	caseInsensitiveCommands: true,
	logger: {
		level: LogLevel.Debug
	},
	intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
	loadMessageCommandListeners: true
});

const main = async () => {
	try {
		client.logger.info('Logging in');
		await client.login(config.discordToken);
		client.logger.info('logged in');
	} catch (error) {
		client.logger.fatal(error);
		await client.destroy();
		process.exit(1);
	}
};

void main();
