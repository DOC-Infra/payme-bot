import './lib/setup';

import { ApplicationCommandRegistries, container, LogLevel, SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config';
import { createPayMe } from './core';
import { openStorage } from './storage/storage';

const config = loadConfig();
container.config = config;
container.payMe = createPayMe(openStorage(config.databasePath), { leadershipRoleId: config.leadershipRoleId });
ApplicationCommandRegistries.setDefaultGuildIds([config.guildId]);

const client = new SapphireClient({
	defaultPrefix: '!',
	caseInsensitiveCommands: true,
	logger: {
		level: LogLevel.Debug
	},
	intents: [
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.MessageContent
	],
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
