import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { fail, hireEmployee } from '../core';
import { memberToActor, toActor } from '../discord/actor';
import { runOutcome } from '../discord/runner';

@ApplyOptions<Command.Options>({
	description: 'Hire a member as an Employee (Leadership only)'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addUserOption((option) => option.setName('user').setDescription('The member to hire').setRequired(true))
				.addStringOption((option) => option.setName('minecraft').setDescription('Their Minecraft Name').setRequired(true).setMaxLength(16))
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const actor = toActor(interaction);
		const hiree = memberToActor(interaction.options.getUser('user', true).id, interaction.options.getMember('user'));
		const minecraftName = interaction.options.getString('minecraft', true);
		const outcome = actor ? hireEmployee(this.container.payMe, actor, hiree, minecraftName) : fail({ code: 'not-permitted' });
		await runOutcome(interaction, outcome);
	}
}
