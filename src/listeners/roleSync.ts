import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { GuildMember, PartialGuildMember } from 'discord.js';
import { syncJobRoles } from '../core';
import { runEffects } from '../discord/runner';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberUpdate })
export class UserEvent extends Listener<typeof Events.GuildMemberUpdate> {
	public override async run(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
		if (newMember.guild.id !== this.container.config.guildId) return;

		const outcome = syncJobRoles(this.container.payMe, newMember.id, [...oldMember.roles.cache.keys()], [...newMember.roles.cache.keys()]);
		if (outcome.ok) await runEffects(outcome.effects);
	}
}
