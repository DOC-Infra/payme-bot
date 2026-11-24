import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ModalSubmitInteraction } from 'discord.js';
import { denyRequest, rejectRequest } from '../core';
import { decodeCustomId } from '../discord/customIds';
import { reasonFieldId } from '../discord/review';
import { acknowledge, runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, { action, requestNumber }: InteractionHandler.ParseResult<this>) {
		await acknowledge(interaction);
		const decide = action === 'reject' ? rejectRequest : denyRequest;
		const reason = interaction.fields.getTextInputValue(reasonFieldId);
		return runAsActor(interaction, { code: 'not-a-reviewer' }, (actor) => decide(payMeOf(interaction), actor, requestNumber, reason));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'reason-modal' ? this.some(id) : this.none();
	}
}
