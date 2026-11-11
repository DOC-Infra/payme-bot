import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { fail, submitRequest } from '../core';
import { toActor } from '../discord/actor';
import { fieldIds, requestModalId } from '../discord/requestModal';
import { runOutcome } from '../discord/runner';

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
		const actor = toActor(interaction);
		await runOutcome(interaction, actor ? submitRequest(this.container.payMe, actor, input) : fail({ code: 'not-hired' }));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		return interaction.customId === requestModalId ? this.some() : this.none();
	}
}
