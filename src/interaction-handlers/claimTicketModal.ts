import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { claimTicket } from '../core';
import { decodeCustomId } from '../discord/customIds';
import { jobFieldId, ticketFieldId } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const ticket = interaction.fields.getTextInputValue(ticketFieldId).trim();
		const jobId = interaction.fields.fields.has(jobFieldId) ? Number(interaction.fields.getStringSelectValues(jobFieldId)[0]) : undefined;
		await runAsActor(interaction, { code: 'not-hired' }, (actor) => claimTicket(payMeOf(interaction), actor, ticket, jobId));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		return decodeCustomId(interaction.customId)?.kind === 'claim-ticket-modal' ? this.some() : this.none();
	}
}
