import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { MessageFlags, InteractionContextType } from 'discord.js';
import { isLeadership, showPayouts } from '../core';
import { guildMembers } from '../discord/actor';
import { runAsActor } from '../discord/runner';

@ApplyOptions<Command.Options>({
	description: 'See who is owed; Leadership can generate, mark paid or discard Payouts'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName(this.name).setContexts(InteractionContextType.Guild).setDescription(this.description)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		return runAsActor(interaction, { code: 'not-permitted' }, async (actor, payMe) =>
			showPayouts(payMe, actor, isLeadership(payMe, actor) ? [] : await guildMembers(interaction.guildId!))
		);
	}
}
