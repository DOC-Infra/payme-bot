import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { approveRequest, checkChange } from '../core';
import { decodeCustomId } from '../discord/customIds';
import { buildReasonModal } from '../discord/review';
import { acknowledge, runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, { action, requestNumber }: InteractionHandler.ParseResult<this>) {
		const { payMe } = this.container;
		return runAsActor(interaction, { code: 'not-a-reviewer' }, async (actor) => {
			if (action === 'approve') {
				await acknowledge(interaction);
				return approveRequest(payMe, actor, requestNumber);
			}

			const checked = checkChange(payMe, actor, requestNumber, action);
			if (!checked.ok) return checked;
			await interaction.showModal(buildReasonModal(action, requestNumber));
			return null;
		});
	}

	public override parse(interaction: ButtonInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'review-button' ? this.some(id) : this.none();
	}
}
