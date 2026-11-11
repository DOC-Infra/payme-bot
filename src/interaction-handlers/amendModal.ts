import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { amendRequest, fail } from '../core';
import { toActor } from '../discord/actor';
import { amendFieldIds, parseAmendModal } from '../discord/entry';
import { runOutcome } from '../discord/runner';

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
		const actor = toActor(interaction);
		await runOutcome(interaction, actor ? amendRequest(this.container.payMe, actor, requestNumber, input) : fail({ code: 'not-your-request' }));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const requestNumber = parseAmendModal(interaction.customId);
		return requestNumber === null ? this.none() : this.some(requestNumber);
	}
}
