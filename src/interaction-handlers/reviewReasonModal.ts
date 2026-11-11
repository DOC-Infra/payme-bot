import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { denyRequest, rejectRequest } from '../core';
import { parseReasonModal, reasonFieldId } from '../discord/review';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, { action, requestNumber }: InteractionHandler.ParseResult<this>) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const decide = action === 'reject' ? rejectRequest : denyRequest;
		const reason = interaction.fields.getTextInputValue(reasonFieldId);
		return runAsActor(interaction, { code: 'not-a-reviewer' }, (actor) => decide(this.container.payMe, actor, requestNumber, reason));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const parsed = parseReasonModal(interaction.customId);
		return parsed ? this.some(parsed) : this.none();
	}
}
