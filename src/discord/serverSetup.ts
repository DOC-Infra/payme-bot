import { container } from '@sapphire/framework';
import { missingPermissions } from './botPermissions';
import { setUpDashboard } from './dashboard';
import { refreshRates } from './ratesChannel';
import { addMissingRequestButtons } from './runner';
import { payMeFor } from './servers';

/**
 * Gets a server ready: caches its members, clears PayMe's old server-only commands, brings old pinned messages up to date, and sets
 * up #payouts and its Rates Channel.
 */
export async function setUpServer(guildId: string): Promise<void> {
	const { client, logger } = container;
	try {
		const guild = await client.guilds.fetch(guildId);
		await guild.members.fetch();
		const missing = await missingPermissions(guild);
		if (missing.length)
			logger.warn(
				`PayMe's role on ${guild.name} (${guildId}) is missing ${missing.join(', ')}. Give its role these permissions, then restart PayMe.`
			);
		// Commands are global now. Clear PayMe's own copies from when they were registered to this server alone, or they show twice.
		await guild.commands.set([]);
	} catch (error) {
		logger.error(`Could not prepare server ${guildId}`, error);
	}
	await addMissingRequestButtons(payMeFor(guildId));
	await setUpDashboard(guildId);
	await refreshRates(guildId).catch((error: unknown) => logger.warn(`Could not refresh the Rates Channel on server ${guildId}`, error));
}
