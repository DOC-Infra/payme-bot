import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { amendRequest } from '../core';
import { amendFieldIds, parseAmendModal } from '../discord/entry';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, requestNumber: InteractionHandler.ParseResult<this>) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const { fields } = interaction;
		const files = fields.getUploadedFiles(amendFieldIds.files)?.values() ?? [];
		const input = {
			notes: fields.getTextInputValue(amendFieldIds.notes),
			link: fields.getTextInputValue(amendFieldIds.link).trim() || null,
			files: [...files].map((file) => ({ name: file.name, url: file.url }))
		};
		await runAsActor(interaction, { code: 'not-your-request' }, (actor) => amendRequest(this.container.payMe, actor, requestNumber, input));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const requestNumber = parseAmendModal(interaction.customId);
		return requestNumber === null ? this.none() : this.some(requestNumber);
	}
}
