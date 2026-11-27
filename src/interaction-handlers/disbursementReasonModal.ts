import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ModalSubmitInteraction } from 'discord.js';
import { declineDisbursement, voidDisbursement } from '../core';
import { decodeCustomId } from '../discord/customIds';
import { disbursementReasonFieldId } from '../discord/disbursements';
import { acknowledge, runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, { action, disbursementNumber }: InteractionHandler.ParseResult<this>) {
		await acknowledge(interaction);
		const reason = interaction.fields.getTextInputValue(disbursementReasonFieldId);
		const change = action === 'void' ? voidDisbursement : declineDisbursement;
		await runAsActor(interaction, { code: 'not-permitted' }, (actor, payMe) => change(payMe, actor, disbursementNumber, reason));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'disbursement-reason-modal' ? this.some(id) : this.none();
	}
}
