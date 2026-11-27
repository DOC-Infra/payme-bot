import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ModalSubmitInteraction } from 'discord.js';
import { declineDisbursement } from '../core';
import { decodeCustomId } from '../discord/customIds';
import { declineReasonFieldId } from '../discord/disbursements';
import { acknowledge, runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, disbursementNumber: InteractionHandler.ParseResult<this>) {
		await acknowledge(interaction);
		const reason = interaction.fields.getTextInputValue(declineReasonFieldId);
		await runAsActor(interaction, { code: 'not-permitted' }, (actor, payMe) => declineDisbursement(payMe, actor, disbursementNumber, reason));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'disbursement-decline-modal' ? this.some(id.disbursementNumber) : this.none();
	}
}
