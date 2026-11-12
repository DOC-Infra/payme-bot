import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, MessageFlags, type ButtonBuilder, type ButtonInteraction } from 'discord.js';
import { amendForm, checkChange, notice, requestLabel, withdrawRequest } from '../core';
import { toEmbeds } from '../discord/embeds';
import { decodeCustomId } from '../discord/customIds';
import { buildAmendModal, confirmWithdrawButton } from '../discord/entry';
import { acknowledge, runAsActor, runOutcome } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, { action, requestNumber }: InteractionHandler.ParseResult<this>) {
		const { payMe } = this.container;
		return runAsActor(interaction, { code: 'not-your-request' }, async (actor) => {
			if (action === 'confirm-withdraw') {
				await acknowledge(interaction);
				const outcome = withdrawRequest(payMe, actor, requestNumber);
				await runOutcome(interaction, outcome);
				if (outcome.ok) await interaction.deleteReply();
				return null;
			}

			if (action === 'amend') {
				const form = amendForm(payMe, actor, requestNumber);
				if (!form.ok) return form;
				await interaction.showModal(buildAmendModal(requestNumber, form.value));
				return null;
			}

			const checked = checkChange(payMe, actor, requestNumber, 'withdraw');
			if (!checked.ok) return checked;
			await interaction.reply({
				embeds: toEmbeds(notice(`Withdraw ${requestLabel(requestNumber)}? It can't be amended or resubmitted afterwards.`, 'warning')),
				components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmWithdrawButton(requestNumber))],
				flags: MessageFlags.Ephemeral
			});
			return null;
		});
	}

	public override parse(interaction: ButtonInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'entry-button' ? this.some(id) : this.none();
	}
}
