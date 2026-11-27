import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import {
	employeeCategoryId,
	generateAllPayouts,
	jobsView,
	listProjects,
	requireLeadership,
	spendingCategoriesView,
	tasksView,
	type Actor,
	type PayMe
} from '../core';
import { decodeCustomId, type DashboardButton } from '../discord/customIds';
import { buildSettingsModal } from '../discord/dashboard';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, action: DashboardButton) {
		if (action === 'settings') return this.openSettings(interaction);
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await runAsActor(interaction, { code: 'not-permitted' }, (actor, payMe) => this.open(payMe, actor, action));
	}

	public override parse(interaction: ButtonInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'dashboard-button' ? this.some(id.action) : this.none();
	}

	private openSettings(interaction: ButtonInteraction) {
		return runAsActor(interaction, { code: 'not-permitted' }, async (actor, payMe) => {
			const refused = requireLeadership(payMe, actor);
			if (refused) return refused;
			await interaction.showModal(buildSettingsModal(employeeCategoryId(payMe)));
			return null;
		});
	}

	private open(payMe: PayMe, actor: Actor, action: DashboardButton) {
		if (action === 'payouts') return generateAllPayouts(payMe, actor);
		if (action === 'projects') return listProjects(payMe, actor);
		if (action === 'jobs') return jobsView(payMe, actor);
		if (action === 'spending-categories') return spendingCategoriesView(payMe, actor);
		return tasksView(payMe, actor);
	}
}
