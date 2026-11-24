import { container } from '@sapphire/framework';
import { requirePermissions } from './botPermissions';
import { ChannelType, OverwriteType, PermissionFlagsBits, type CategoryChannel, type Guild, type TextChannel } from 'discord.js';

/** The category PayMe keeps #payouts and every Job's Review Channel in, found by name or created. */
export const paymentReviewCategoryName = 'Payment Review';
export const payoutsChannelName = 'payouts';
export const employeesCategoryName = 'Employees';

const viewer = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];
const bot = [
	...viewer,
	PermissionFlagsBits.SendMessages,
	PermissionFlagsBits.EmbedLinks,
	PermissionFlagsBits.AttachFiles,
	PermissionFlagsBits.ManageMessages,
	PermissionFlagsBits.PinMessages
];

/**
 * The text channel called `name` in the server's Payment Review category, creating the category or channel when missing. A new
 * channel is private to PayMe and `viewerRoleIds`; administrators see every channel anyway. An existing one is adopted as it is,
 * except that PayMe and `viewerRoleIds` are let in.
 */
export async function paymentReviewChannel(guildId: string, name: string, viewerRoleIds: readonly string[] = []): Promise<TextChannel> {
	const guild = await container.client.guilds.fetch(guildId);
	await requirePermissions(guild);
	const category = await categoryNamed(guild, paymentReviewCategoryName);
	const existing = category.children.cache.find((child) => child.type === ChannelType.GuildText && child.name === name);
	if (existing?.type === ChannelType.GuildText) {
		await existing.permissionOverwrites.edit(guild.members.me!.id, allow(bot), { type: OverwriteType.Member });
		for (const roleId of viewerRoleIds) await existing.permissionOverwrites.edit(roleId, allow(viewer), { type: OverwriteType.Role });
		return existing;
	}
	return guild.channels.create({
		name,
		type: ChannelType.GuildText,
		parent: category.id,
		permissionOverwrites: [
			{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
			{ id: container.client.user!.id, type: OverwriteType.Member, allow: bot },
			...viewerRoleIds.map((id) => ({ id, type: OverwriteType.Role, allow: viewer }))
		]
	});
}

/** The category new Employee Channels go in: the one Leadership picked, if it still exists, or one called "Employees". */
export async function employeeCategory(guild: Guild, pickedId: string | null): Promise<CategoryChannel> {
	await requirePermissions(guild);
	const picked = pickedId ? await guild.channels.fetch(pickedId).catch(() => null) : null;
	if (picked?.type === ChannelType.GuildCategory) return picked;
	return categoryNamed(guild, employeesCategoryName);
}

/** The category with this name, ignoring case, created when the server has none. */
async function categoryNamed(guild: Guild, name: string): Promise<CategoryChannel> {
	const channels = await guild.channels.fetch();
	const wanted = name.toLowerCase();
	const found = channels.find((channel) => channel?.type === ChannelType.GuildCategory && channel.name.toLowerCase() === wanted);
	if (found?.type === ChannelType.GuildCategory) return found;
	return guild.channels.create({ name, type: ChannelType.GuildCategory });
}

function allow(flags: readonly bigint[]) {
	return Object.fromEntries(flags.map((flag) => [permissionName(flag), true]));
}

function permissionName(flag: bigint): string {
	return Object.entries(PermissionFlagsBits).find(([, value]) => value === flag)![0];
}
