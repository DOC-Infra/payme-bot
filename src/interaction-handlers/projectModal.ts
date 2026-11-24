import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { createProject, editShare, fundProject, giveShare, removeShare, type Actor } from '../core';
import { fetchActor } from '../discord/actor';
import { decodeCustomId, type ProjectModal } from '../discord/customIds';
import { projectFieldIds } from '../discord/projects';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, modal: InteractionHandler.ParseResult<this>) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) => this.submit(interaction, actor, modal));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'project-modal' ? this.some(id) : this.none();
	}

	private async submit(interaction: ModalSubmitInteraction, actor: Actor, modal: ProjectModal) {
		const payMe = payMeOf(interaction);
		const { fields } = interaction;
		const amount = fields.getTextInputValue(projectFieldIds.amount);

		switch (modal.action) {
			case 'create':
				return createProject(payMe, actor, {
					name: fields.getTextInputValue(projectFieldIds.name).trim(),
					jobId: Number(fields.getStringSelectValues(projectFieldIds.job)[0]),
					budget: amount
				});
			case 'fund':
				return fundProject(payMe, actor, modal.projectId, amount);
			case 'share': {
				const employee = await fetchActor(interaction, fields.getSelectedUsers(projectFieldIds.employee, true).first()!.id);
				return giveShare(payMe, actor, modal.projectId, employee, { amount, note: fields.getTextInputValue(projectFieldIds.note) });
			}
			case 'edit-share':
				if (fields.getCheckbox(projectFieldIds.remove)) return removeShare(payMe, actor, modal.shareId);
				return editShare(payMe, actor, modal.shareId, { amount, note: fields.getTextInputValue(projectFieldIds.note) });
		}
	}
}
