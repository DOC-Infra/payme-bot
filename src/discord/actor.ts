import type { BaseInteraction, GuildMember } from 'discord.js';
import type { Actor } from '../core';

export function toActor(interaction: BaseInteraction): Actor | null {
	if (interaction.inCachedGuild()) return { userId: interaction.user.id, roleIds: [...interaction.member.roles.cache.keys()] };
	if (interaction.inRawGuild()) return { userId: interaction.user.id, roleIds: interaction.member.roles };
	return null;
}

export function memberToActor(userId: string, member: GuildMember | { roles: string[] } | null): Actor {
	if (!member) return { userId, roleIds: [] };
	return { userId, roleIds: Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()] };
}

/** The member as an Actor with their current roles, or with no roles if they are not in the interaction's guild. */
export async function fetchActor(interaction: BaseInteraction, userId: string): Promise<Actor> {
	const member = await interaction.guild?.members.fetch(userId).catch(() => null);
	return memberToActor(userId, member ?? null);
}
