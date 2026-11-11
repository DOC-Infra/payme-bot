import type { APIInteractionDataResolvedGuildMember, BaseInteraction, GuildMember } from 'discord.js';
import type { Actor } from '../core';

export function toActor(interaction: BaseInteraction): Actor | null {
	if (interaction.inCachedGuild()) return { userId: interaction.user.id, roleIds: [...interaction.member.roles.cache.keys()] };
	if (interaction.inRawGuild()) return { userId: interaction.user.id, roleIds: interaction.member.roles };
	return null;
}

export function memberToActor(userId: string, member: GuildMember | APIInteractionDataResolvedGuildMember | null): Actor {
	if (!member) return { userId, roleIds: [] };
	return { userId, roleIds: Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()] };
}
