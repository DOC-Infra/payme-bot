import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { fail, viewPayouts } from '../core';
import { toActor } from '../discord/actor';
import { runOutcome } from '../discord/runner';

@ApplyOptions<Command.Options>({
	description: 'See who is owed and generate, mark paid or discard Payouts (Leadership only)'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => builder.setName(this.name).setDescription(this.description));
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const actor = toActor(interaction);
		await runOutcome(interaction, actor ? viewPayouts(this.container.payMe, actor) : fail({ code: 'not-permitted' }));
	}
}
