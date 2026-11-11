import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { claimTicket } from '../core';
import { claimTicketModalId, ticketFieldId } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const ticket = interaction.fields.getTextInputValue(ticketFieldId).trim();
		await runAsActor(interaction, { code: 'not-hired' }, (actor) => claimTicket(this.container.payMe, actor, ticket));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		return interaction.customId === claimTicketModalId ? this.some() : this.none();
	}
}
