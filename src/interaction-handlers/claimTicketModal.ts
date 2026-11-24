import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { claimTicket } from '../core';
import { decodeCustomId } from '../discord/customIds';
import { jobFieldId, ticketFieldId } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	/** The claim goes to the server the form was opened for: `home` when that was not the one it is shown in. */
	public async run(interaction: ModalSubmitInteraction, home: string | null) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const ticket = interaction.fields.getTextInputValue(ticketFieldId).trim();
		const jobId = interaction.fields.fields.has(jobFieldId) ? Number(interaction.fields.getStringSelectValues(jobFieldId)[0]) : undefined;
		await runAsActor(interaction, { code: 'not-hired' }, (actor, payMe) => claimTicket(payMe, actor, ticket, jobId), home ?? interaction.guildId);
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'claim-ticket-modal' ? this.some(id.home) : this.none();
	}
}
