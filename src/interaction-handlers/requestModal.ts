import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { submitRequest } from '../core';
import { fieldIds, requestModalId } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const { fields } = interaction;
		const files = fields.getUploadedFiles(fieldIds.files)?.values() ?? [];
		const input = {
			taskId: Number(fields.getStringSelectValues(fieldIds.task)[0]),
			notes: fields.getTextInputValue(fieldIds.notes),
			link: fields.getTextInputValue(fieldIds.link).trim() || null,
			files: [...files].map((file) => ({ name: file.name, url: file.url }))
		};
		await runAsActor(interaction, { code: 'not-hired' }, (actor) => submitRequest(this.container.payMe, actor, input));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		return interaction.customId === requestModalId ? this.some() : this.none();
	}
}
