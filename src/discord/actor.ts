import type { BaseInteraction } from 'discord.js';
import type { Actor } from '../core';

export function toActor(interaction: BaseInteraction): Actor | null {
	if (interaction.inCachedGuild()) return { userId: interaction.user.id, roleIds: [...interaction.member.roles.cache.keys()] };
	if (interaction.inRawGuild()) return { userId: interaction.user.id, roleIds: interaction.member.roles };
	return null;
}
