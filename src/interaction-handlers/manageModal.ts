import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { addTask, checkNewJob, createJob, fail, editJob, editTask, reviewChannelName, setManagerRoles, setTaskJobs, type Actor } from '../core';
import { decodeCustomId, type ManageModalAction } from '../discord/customIds';
import { holderUserIds } from '../discord/jobs';
import { manageFieldIds } from '../discord/manage';
import { paymentReviewChannel } from '../discord/paymentReview';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

interface Submitted {
	action: ManageModalAction;
	id: number | null;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, submitted: Submitted) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) => this.submit(interaction, actor, submitted));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'manage-modal' ? this.some({ action: id.action, id: id.id }) : this.none();
	}

	private async submit(interaction: ModalSubmitInteraction, actor: Actor, { action, id }: Submitted) {
		const payMe = payMeOf(interaction);
		const { fields } = interaction;
		const text = (fieldId: string) => fields.getTextInputValue(fieldId).trim();
		const jobIds = () => fields.getStringSelectValues(manageFieldIds.jobs).map(Number);

		if (action === 'new-job' || (action === 'edit-job' && id !== null)) {
			const name = text(manageFieldIds.name);
			const employeeRoleId = fields.getSelectedRoles(manageFieldIds.employeeRole, true).first()!.id;
			if (id !== null) return editJob(payMe, actor, id, { name, employeeRoleId });

			const refused = checkNewJob(payMe, actor, name);
			if (refused) return refused;
			const channelName = reviewChannelName(name);
			const review = await paymentReviewChannel(interaction.guildId!, channelName).catch((error: unknown) => {
				this.container.logger.warn(`Could not create or adopt #${channelName}`, error);
				return null;
			});
			if (!review) return fail({ code: 'review-channel-unavailable', name: channelName });
			return createJob(payMe, actor, { name, employeeRoleId, reviewChannelId: review.id });
		}
		if (action === 'new-task') {
			return addTask(payMe, actor, {
				name: text(manageFieldIds.name),
				rate: text(manageFieldIds.rate),
				jobIds: jobIds(),
				evidenceRequired: fields.getCheckbox(manageFieldIds.evidence),
				notesRequired: fields.getCheckbox(manageFieldIds.notes)
			});
		}
		if (id === null) return null;
		if (action === 'job-managers') {
			const roleIds = [...(fields.getSelectedRoles(manageFieldIds.managerRoles)?.keys() ?? [])];
			return setManagerRoles(payMe, actor, id, roleIds, await holderUserIds(interaction.guildId!, id));
		}
		if (action === 'edit-task') {
			return editTask(payMe, actor, id, {
				rate: text(manageFieldIds.rate),
				evidenceRequired: fields.getCheckbox(manageFieldIds.evidence),
				notesRequired: fields.getCheckbox(manageFieldIds.notes)
			});
		}
		return setTaskJobs(payMe, actor, id, jobIds());
	}
}
