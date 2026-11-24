import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { submitRequest } from '../core';
import { fetchActorIn } from '../discord/actor';
import { decodeCustomId } from '../discord/customIds';
import { fieldIds } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, { home, employeeUserId }: { home: string; employeeUserId: string | null }) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const { fields } = interaction;
		const files = fields.getUploadedFiles(fieldIds.files)?.values() ?? [];
		const [taskId, jobId] = fields.getStringSelectValues(fieldIds.task)[0].split(':').map(Number);
		const input = {
			taskId,
			jobId,
			notes: fields.getTextInputValue(fieldIds.notes),
			link: fields.getTextInputValue(fieldIds.link).trim() || null,
			files: [...files].map((file) => ({ name: file.name, url: file.url }))
		};
		const employee = employeeUserId ? await fetchActorIn(home, employeeUserId) : null;
		await runAsActor(interaction, { code: 'not-hired' }, (actor, payMe) => submitRequest(payMe, actor, input, employee ?? actor), home);
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'request-modal' ? this.some({ home: id.home, employeeUserId: id.employeeUserId }) : this.none();
	}
}
