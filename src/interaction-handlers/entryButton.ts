import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, MessageFlags, type ButtonBuilder, type ButtonInteraction } from 'discord.js';
import { checkAmend, checkWithdraw, requestLabel, withdrawRequest } from '../core';
import { buildAmendModal, confirmWithdrawButton, parseEntryButton } from '../discord/entry';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, { action, requestNumber }: InteractionHandler.ParseResult<this>) {
		const { payMe } = this.container;
		return runAsActor(interaction, { code: 'not-your-request' }, async (actor) => {
			if (action === 'confirm-withdraw') {
				await interaction.deferReply({ flags: MessageFlags.Ephemeral });
				return withdrawRequest(payMe, actor, requestNumber);
			}

			if (action === 'amend') {
				const checked = checkAmend(payMe, actor, requestNumber);
				if (!checked.ok) return checked;
				await interaction.showModal(buildAmendModal(requestNumber));
				return null;
			}

			const checked = checkWithdraw(payMe, actor, requestNumber);
			if (!checked.ok) return checked;
			await interaction.reply({
				content: `Withdraw ${requestLabel(requestNumber)}? It can't be amended or resubmitted afterwards.`,
				components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmWithdrawButton(requestNumber))],
				flags: MessageFlags.Ephemeral
			});
			return null;
		});
	}

	public override parse(interaction: ButtonInteraction) {
		const parsed = parseEntryButton(interaction.customId);
		return parsed ? this.some(parsed) : this.none();
	}
}
