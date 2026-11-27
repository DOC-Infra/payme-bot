import { container } from '@sapphire/framework';
import { PermissionFlagsBits, PermissionsBitField, type BaseInteraction, type GuildMember } from 'discord.js';
import type { Actor } from '../core';

export function toActor(interaction: BaseInteraction): Actor | null {
	const administrator = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
	if (interaction.inCachedGuild()) return { userId: interaction.user.id, roleIds: [...interaction.member.roles.cache.keys()], administrator };
	if (interaction.inRawGuild()) return { userId: interaction.user.id, roleIds: interaction.member.roles, administrator };
	return null;
}

export function memberToActor(userId: string, member: GuildMember | { roles: string[]; permissions: string } | null): Actor {
	if (!member) return { userId, roleIds: [], administrator: false };
	if ('cache' in member.roles) {
		const guildMember = member as GuildMember;
		return {
			userId,
			roleIds: [...guildMember.roles.cache.keys()],
			administrator: guildMember.permissions.has(PermissionFlagsBits.Administrator)
		};
	}
	const raw = member as { roles: string[]; permissions: string };
	return { userId, roleIds: raw.roles, administrator: new PermissionsBitField(BigInt(raw.permissions)).has(PermissionFlagsBits.Administrator) };
}

/** The member as an Actor with their current roles, or with no roles if they are not in the interaction's guild. */
export async function fetchActor(interaction: BaseInteraction, userId: string): Promise<Actor> {
	const member = await interaction.guild?.members.fetch(userId).catch(() => null);
	return memberToActor(userId, member ?? null);
}

/** The member of the server as an Actor, with the roles and permissions they have there, or none if they are not a member. */
export async function fetchActorIn(guildId: string, userId: string): Promise<Actor> {
	const guild = await container.client.guilds.fetch(guildId);
	const member = await guild.members.fetch(userId).catch(() => null);
	return memberToActor(userId, member);
}
