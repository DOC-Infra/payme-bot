import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { jobTasksView, jobView, spendingCategoryView, taskView } from '../core';
import { decodeCustomId, type ManageMenuAction } from '../discord/customIds';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.SelectMenu
})
export class MenuHandler extends InteractionHandler {
	public async run(interaction: StringSelectMenuInteraction, action: ManageMenuAction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const payMe = payMeOf(interaction);
		const id = Number(interaction.values[0]);
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) => {
			if (action === 'open-job') return jobView(payMe, actor, id);
			if (action === 'open-job-tasks') return jobTasksView(payMe, actor, id);
			if (action === 'open-category') return spendingCategoryView(payMe, actor, id);
			return taskView(payMe, actor, id);
		});
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'manage-menu' ? this.some(id.action) : this.none();
	}
}
