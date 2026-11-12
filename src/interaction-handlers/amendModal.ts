import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ModalSubmitInteraction } from 'discord.js';
import { amendRequest } from '../core';
import { decodeCustomId } from '../discord/customIds';
import { amendFieldIds } from '../discord/entry';
import { acknowledge, runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, requestNumber: InteractionHandler.ParseResult<this>) {
		await acknowledge(interaction);
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
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'amend-modal' ? this.some(id.requestNumber) : this.none();
	}
}
