import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, MessageFlags, type ButtonBuilder, type ButtonInteraction } from 'discord.js';
import { checkAmend, checkWithdraw, fail, requestLabel, withdrawRequest } from '../core';
import { toActor } from '../discord/actor';
import { buildAmendModal, confirmWithdrawButton, parseEntryButton } from '../discord/entry';
import { runOutcome } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, { action, requestNumber }: InteractionHandler.ParseResult<this>) {
		const { payMe } = this.container;
		const actor = toActor(interaction);
		if (!actor) return runOutcome(interaction, fail({ code: 'not-your-request' }));

		if (action === 'confirm-withdraw') {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			return runOutcome(interaction, withdrawRequest(payMe, actor, requestNumber));
		}

		if (action === 'amend') {
			const checked = checkAmend(payMe, actor, requestNumber);
			if (!checked.ok) return runOutcome(interaction, checked);
			return interaction.showModal(buildAmendModal(requestNumber));
		}

		const checked = checkWithdraw(payMe, actor, requestNumber);
		if (!checked.ok) return runOutcome(interaction, checked);
		return interaction.reply({
			content: `Withdraw ${requestLabel(requestNumber)}? It can't be amended or resubmitted afterwards.`,
			components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmWithdrawButton(requestNumber))],
			flags: MessageFlags.Ephemeral
		});
	}

	public override parse(interaction: ButtonInteraction) {
		const parsed = parseEntryButton(interaction.customId);
		return parsed ? this.some(parsed) : this.none();
	}
}
