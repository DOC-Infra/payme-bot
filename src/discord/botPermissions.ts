import { PermissionFlagsBits, type Guild } from 'discord.js';

/**
 * Every server-wide permission PayMe needs. Discord refuses to create a channel whose permissions grant anything the bot itself
 * lacks, so PayMe needs each permission it gives itself on its channels, plus Manage Channels and Manage Roles to make them.
 */
const required = {
	'Manage Channels': PermissionFlagsBits.ManageChannels,
	'Manage Roles': PermissionFlagsBits.ManageRoles,
	'View Channels': PermissionFlagsBits.ViewChannel,
	'Send Messages': PermissionFlagsBits.SendMessages,
	'Read Message History': PermissionFlagsBits.ReadMessageHistory,
	'Embed Links': PermissionFlagsBits.EmbedLinks,
	'Attach Files': PermissionFlagsBits.AttachFiles,
	'Manage Messages': PermissionFlagsBits.ManageMessages,
	'Pin Messages': PermissionFlagsBits.PinMessages,
	'Create Public Threads': PermissionFlagsBits.CreatePublicThreads,
	'Send Messages in Threads': PermissionFlagsBits.SendMessagesInThreads,
	'Manage Threads': PermissionFlagsBits.ManageThreads
};

/** The names of the permissions PayMe's role is missing on the server, empty when it has them all or is an administrator. */
export async function missingPermissions(guild: Guild): Promise<string[]> {
	const me = guild.members.me ?? (await guild.members.fetchMe());
	return Object.entries(required)
		.filter(([, flag]) => !me.permissions.has(flag))
		.map(([name]) => name);
}

/** Throws, naming what is missing, before PayMe asks Discord for something it would refuse with a bare "Missing Permissions". */
export async function requirePermissions(guild: Guild): Promise<void> {
	const missing = await missingPermissions(guild);
	if (missing.length) throw new Error(`PayMe's role on ${guild.name} is missing these permissions: ${missing.join(', ')}`);
}
