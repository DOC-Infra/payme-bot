import { container } from '@sapphire/framework';
import { ChannelType, PermissionFlagsBits, type Guild, type GuildBasedChannel } from 'discord.js';
import { fail, type Failure } from '../core';

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

/**
 * What PayMe needs in an existing channel to adopt it as an Employee Channel: to see it, set who can see it ("Manage Permissions" is
 * Manage Roles within a channel), and give itself the permissions it uses there.
 */
const requiredInEmployeeChannel = {
	'View Channel': PermissionFlagsBits.ViewChannel,
	'Manage Permissions': PermissionFlagsBits.ManageRoles,
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

/**
 * The permissions PayMe lacks in the channel itself, which its own overrides can take away even when its role has them server-wide.
 * Empty when it has them all or is an administrator.
 */
export async function missingChannelPermissions(channel: GuildBasedChannel): Promise<string[]> {
	const me = channel.guild.members.me ?? (await channel.guild.members.fetchMe());
	const granted = channel.permissionsFor(me);
	return Object.entries(requiredInEmployeeChannel)
		.filter(([, flag]) => !granted.has(flag))
		.map(([name]) => name);
}

/**
 * Why PayMe can't adopt the channel as an Employee Channel, checked before anything is saved, or null when it can. A channel PayMe
 * can't even fetch is one it can't see.
 */
export async function checkEmployeeChannel(guildId: string, channelId: string): Promise<Failure | null> {
	const guild = await container.client.guilds.fetch(guildId);
	const channel = await guild.channels.fetch(channelId).catch(() => null);
	if (!channel) return fail({ code: 'employee-channel-unusable', channelId, missing: Object.keys(requiredInEmployeeChannel) });
	if (channel.type !== ChannelType.GuildText) return fail({ code: 'link-needs-a-member' });
	const missing = await missingChannelPermissions(channel);
	return missing.length ? fail({ code: 'employee-channel-unusable', channelId, missing }) : null;
}
