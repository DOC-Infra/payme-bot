import { container } from '@sapphire/framework';
import type { BaseInteraction } from 'discord.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createPayMe, type PayMe } from '../core';
import { openAppStorage } from '../storage/app';
import { openStorage, type Storage } from '../storage/storage';

const opened = new Map<string, PayMe>();

/** The server's own PayMe, kept in its own database file so no two servers ever share data. */
export function payMeFor(guildId: string): PayMe {
	const existing = opened.get(guildId);
	if (existing) return existing;
	if (!isPayMeServer(guildId)) throw new Error(`PayMe is not installed in server ${guildId}`);

	mkdirSync(container.config.dataDir, { recursive: true });
	const payMe = createPayMe(openStorage(join(container.config.dataDir, `${guildId}.db`)));
	opened.set(guildId, payMe);
	return payMe;
}

/** The PayMe of the server the interaction happened in. Commands are server-only, so every interaction PayMe handles has one. */
export function payMeOf(interaction: BaseInteraction): PayMe {
	if (!interaction.guildId) throw new Error('This interaction did not happen in a server');
	return payMeFor(interaction.guildId);
}

/** Whether PayMe is installed in the server, as opposed to only being used there as someone's user app. */
export function isPayMeServer(guildId: string | null): guildId is string {
	return guildId !== null && container.client.guilds.cache.has(guildId);
}

let app: Storage | null = null;

/** The database for data that belongs to users rather than servers, such as each user's home server. */
export function appStorage(): Storage {
	if (app) return app;
	mkdirSync(container.config.dataDir, { recursive: true });
	return (app = openAppStorage(join(container.config.dataDir, 'app.db')));
}
