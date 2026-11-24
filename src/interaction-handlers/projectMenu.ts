import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { fail, getProject, showProject } from '../core';
import { decodeCustomId } from '../discord/customIds';
import { buildEditShareModal } from '../discord/projects';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.SelectMenu
})
export class MenuHandler extends InteractionHandler {
	/** Opening a Project shows it; picking one of its Shares opens the form to change or remove it. */
	public async run(interaction: StringSelectMenuInteraction, projectId: number | null) {
		const payMe = payMeOf(interaction);
		const picked = Number(interaction.values[0]);
		if (projectId === null) {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			return runAsActor(interaction, { code: 'not-permitted' }, (actor) => showProject(payMe, actor, picked));
		}
		return runAsActor(interaction, { code: 'not-permitted' }, async () => {
			const share = getProject(payMe, projectId)?.shares.find((given) => given.id === picked);
			if (!share) return fail({ code: 'share-not-found' });
			await interaction.showModal(buildEditShareModal(share));
			return null;
		});
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		const id = decodeCustomId(interaction.customId);
		if (id?.kind === 'project-select') return this.some(null);
		return id?.kind === 'share-select' ? this.some(id.projectId) : this.none();
	}
}
