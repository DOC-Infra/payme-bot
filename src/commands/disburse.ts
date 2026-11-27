import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { InteractionContextType, MessageFlags } from 'discord.js';
import { getSpendingCategory, jobsRequestableFrom, requestableCategories, requestDisbursement, type Actor } from '../core';
import { toActor } from '../discord/actor';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<Command.Options>({
	description: 'Request a Disbursement from a Spending Category, posted here for discussion'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setContexts(InteractionContextType.Guild)
				.setDescription(this.description)
				.addIntegerOption((option) =>
					option.setName('category').setDescription('The Spending Category to pay from').setRequired(true).setAutocomplete(true)
				)
				.addStringOption((option) =>
					option.setName('recipient').setDescription('The Minecraft Name to pay').setRequired(true).setMinLength(3).setMaxLength(16)
				)
				.addStringOption((option) => option.setName('amount').setDescription('The amount, like 1500 or 12.5').setRequired(true))
				.addStringOption((option) => option.setName('reason').setDescription('What it is for').setRequired(true).setMaxLength(1000))
				.addStringOption((option) => option.setName('link').setDescription('A link with more detail').setMaxLength(500))
				.addStringOption((option) =>
					option
						.setName('paid-on')
						.setDescription('Leadership only: record one already paid outside PayMe on this UTC day, like 2026-11-05')
						.setMinLength(10)
						.setMaxLength(10)
				)
				.addIntegerOption((option) =>
					option.setName('job').setDescription('The Job it is for, if more than one of yours draws on the Category').setAutocomplete(true)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const { options } = interaction;
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) =>
			requestDisbursement(payMeOf(interaction), actor, {
				categoryId: options.getInteger('category', true),
				jobId: options.getInteger('job') ?? undefined,
				recipient: options.getString('recipient', true),
				amount: options.getString('amount', true),
				reason: options.getString('reason', true),
				link: options.getString('link'),
				paidOn: options.getString('paid-on')
			})
		);
	}

	public override async autocompleteRun(interaction: Command.AutocompleteInteraction) {
		const payMe = payMeOf(interaction);
		const actor = toActor(interaction);
		if (!actor) return interaction.respond([]);
		const focused = interaction.options.getFocused(true);
		const choices = focused.name === 'job' ? this.jobChoices(interaction, actor) : requestableCategories(payMe, actor);
		const query = focused.value.toLowerCase();
		await interaction.respond(
			choices
				.filter((choice) => choice.name.toLowerCase().includes(query))
				.slice(0, 25)
				.map((choice) => ({ name: choice.name, value: choice.id }))
		);
	}

	/** The requester's Jobs that draw on the Category already picked. */
	private jobChoices(interaction: Command.AutocompleteInteraction, actor: Actor) {
		const payMe = payMeOf(interaction);
		const category = getSpendingCategory(payMe, interaction.options.getInteger('category') ?? 0);
		return category ? jobsRequestableFrom(payMe, actor, category) : [];
	}
}
