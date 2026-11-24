import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, ButtonBuilder, MessageFlags, type ButtonInteraction } from 'discord.js';
import {
	allJobs,
	changeableShares,
	closeProject,
	fail,
	getEmployee,
	getProject,
	maxFormOptions,
	requireLeadership,
	type Actor,
	type Project
} from '../core';
import { decodeCustomId, type ProjectButton } from '../discord/customIds';
import { buildCreateProjectModal, buildFundModal, buildGiveShareModal, confirmCloseButton, shareSelectRow } from '../discord/projects';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, button: InteractionHandler.ParseResult<this>) {
		if (button.action === 'confirm-close') await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) => this.press(interaction, actor, button));
	}

	public override parse(interaction: ButtonInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'project-button' ? this.some(id) : this.none();
	}

	private async press(interaction: ButtonInteraction, actor: Actor, button: ProjectButton) {
		const payMe = payMeOf(interaction);
		if (button.action === 'create') {
			const refused = requireLeadership(payMe, actor);
			if (refused) return refused;
			const jobs = allJobs(payMe).filter((job) => !job.retired);
			if (jobs.length === 0) return fail({ code: 'job-not-found' });
			await interaction.showModal(buildCreateProjectModal(jobs.slice(0, maxFormOptions)));
			return null;
		}
		if (button.action === 'confirm-close') return closeProject(payMe, actor, button.projectId);

		const project = getProject(payMe, button.projectId);
		if (!project) return fail({ code: 'project-not-found' });
		if (project.state !== 'open') return fail({ code: 'project-closed', name: project.name });
		if (button.action === 'share') {
			await interaction.showModal(buildGiveShareModal(project.id, project.name));
			return null;
		}
		if (button.action === 'change-share') return this.askForShare(interaction, project);

		const refused = requireLeadership(payMe, actor);
		if (refused) return refused;
		if (button.action === 'fund') {
			await interaction.showModal(buildFundModal(project.id, project.name));
			return null;
		}
		await interaction.reply({
			content: `Close the ${project.name} Project? It will take no more funding or Shares.`,
			components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmCloseButton(project.id, project.name))],
			flags: MessageFlags.Ephemeral,
			allowedMentions: { parse: [] }
		});
		return null;
	}

	private async askForShare(interaction: ButtonInteraction, project: Project) {
		const shares = changeableShares(project).slice(0, maxFormOptions);
		if (shares.length === 0) return fail({ code: 'share-not-found' });
		const nameOf = (userId: string) => getEmployee(payMeOf(interaction), userId)?.minecraftName ?? userId;
		await interaction.reply({
			content: `Pick the Share of the ${project.name} Project to change or remove.`,
			components: [shareSelectRow(project.id, shares, nameOf)],
			flags: MessageFlags.Ephemeral,
			allowedMentions: { parse: [] }
		});
		return null;
	}
}
