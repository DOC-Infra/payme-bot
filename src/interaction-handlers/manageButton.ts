import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, ButtonBuilder, MessageFlags, type ButtonInteraction, type ModalBuilder } from 'discord.js';
import {
	allJobs,
	fail,
	getJob,
	getTask,
	maxFormOptions,
	requireLeadership,
	restoreTask,
	retireJob,
	retireTask,
	type Actor,
	type PayMe
} from '../core';
import { decodeCustomId, type ManageButtonAction } from '../discord/customIds';
import {
	buildEditTaskModal,
	buildJobModal,
	buildManagerRolesModal,
	buildNewTaskModal,
	buildTaskJobsModal,
	confirmRetireJobButton
} from '../discord/manage';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

interface Pressed {
	action: ManageButtonAction;
	id: number | null;
}

/** Buttons whose result is a reply rather than a form. */
const replying: readonly ManageButtonAction[] = ['confirm-retire-job', 'retire-task', 'restore-task'];

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, pressed: Pressed) {
		if (replying.includes(pressed.action)) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) => this.press(interaction, actor, pressed));
	}

	public override parse(interaction: ButtonInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'manage-button' ? this.some({ action: id.action, id: id.id }) : this.none();
	}

	private async press(interaction: ButtonInteraction, actor: Actor, { action, id }: Pressed) {
		const payMe = payMeOf(interaction);
		const refused = requireLeadership(payMe, actor);
		if (refused) return refused;

		if (action === 'new-job') return this.show(interaction, buildJobModal(null));
		if (action === 'new-task') {
			const jobs = activeJobs(payMe);
			if (jobs.length === 0) return fail({ code: 'job-not-found' });
			return this.show(interaction, buildNewTaskModal(jobs, id));
		}
		if (id === null) return null;

		switch (action) {
			case 'confirm-retire-job':
				return retireJob(payMe, actor, id);
			case 'retire-task':
				return retireTask(payMe, actor, id);
			case 'restore-task':
				return restoreTask(payMe, actor, id);
			case 'edit-task':
			case 'task-jobs': {
				const task = getTask(payMe, id);
				if (!task) return fail({ code: 'task-not-found' });
				return this.show(interaction, action === 'edit-task' ? buildEditTaskModal(task) : buildTaskJobsModal(task, activeJobs(payMe)));
			}
		}

		const job = getJob(payMe, id);
		if (!job) return fail({ code: 'job-not-found' });
		if (action === 'edit-job') return this.show(interaction, buildJobModal(job));
		if (action === 'job-managers') return this.show(interaction, buildManagerRolesModal(job));
		await interaction.reply({
			content: `Retire the ${job.name} Job? Its Tasks that belong to no other active Job are retired too.`,
			components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmRetireJobButton(job))],
			flags: MessageFlags.Ephemeral,
			allowedMentions: { parse: [] }
		});
		return null;
	}

	private async show(interaction: ButtonInteraction, modal: ModalBuilder) {
		await interaction.showModal(modal);
		return null;
	}
}

function activeJobs(payMe: PayMe) {
	return allJobs(payMe)
		.filter((job) => !job.retired)
		.slice(0, maxFormOptions);
}
