import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { InteractionContextType, MessageFlags, type SlashCommandStringOption } from 'discord.js';
import { monthName, monthOf, setAppropriation, showAppropriation } from '../core';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

const monthOption = (name: string, description: string, required: boolean) => (option: SlashCommandStringOption) =>
	option.setName(name).setDescription(description).setRequired(required).setAutocomplete(true);

@ApplyOptions<Command.Options>({
	description: "The server's monthly Appropriation and what has been spent against it (Leadership only)"
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setContexts(InteractionContextType.Guild)
				.setDescription(this.description)
				.addSubcommand((sub) =>
					sub
						.setName('show')
						.setDescription('Show a month against its Appropriation')
						.addStringOption(monthOption('month', 'The month, like 2026-11; this month if left out', false))
				)
				.addSubcommand((sub) =>
					sub
						.setName('set')
						.setDescription('Set the Appropriation from a month onward')
						.addStringOption((option) =>
							option.setName('amount').setDescription('The monthly amount, like 1500 or 12.5').setRequired(true)
						)
						.addStringOption(monthOption('from', 'The first month it applies to, like 2026-11', true))
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const payMe = payMeOf(interaction);
		const { options } = interaction;
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) =>
			options.getSubcommand() === 'set'
				? setAppropriation(payMe, actor, options.getString('amount', true), options.getString('from', true))
				: showAppropriation(payMe, actor, options.getString('month'))
		);
	}

	/** Next month and the twelve before it, newest first. */
	public override async autocompleteRun(interaction: Command.AutocompleteInteraction) {
		const query = interaction.options.getFocused().toLowerCase();
		const now = new Date();
		const months = Array.from({ length: 13 }, (_, index) => monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1 - index))));
		const choices = months.map((month) => ({ name: monthName(month), value: month }));
		await interaction.respond(choices.filter((choice) => `${choice.name} ${choice.value}`.toLowerCase().includes(query)).slice(0, 25));
	}
}
