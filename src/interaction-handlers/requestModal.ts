import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { submitRequest } from '../core';
import { fetchActor } from '../discord/actor';
import { fieldIds, parseForEmployee, requestModalId } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, employeeUserId: string | null) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const { fields } = interaction;
		const files = fields.getUploadedFiles(fieldIds.files)?.values() ?? [];
		const input = {
			taskId: Number(fields.getStringSelectValues(fieldIds.task)[0]),
			notes: fields.getTextInputValue(fieldIds.notes),
			link: fields.getTextInputValue(fieldIds.link).trim() || null,
			files: [...files].map((file) => ({ name: file.name, url: file.url }))
		};
		const employee = employeeUserId ? await fetchActor(interaction, employeeUserId) : null;
		await runAsActor(interaction, { code: 'not-hired' }, (actor) => submitRequest(this.container.payMe, actor, input, employee ?? actor));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const employeeUserId = parseForEmployee(requestModalId, interaction.customId);
		return employeeUserId === undefined ? this.none() : this.some(employeeUserId);
	}
}
