import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { approveRequest, checkReviewer, fail } from '../core';
import { toActor } from '../discord/actor';
import { buildReasonModal, parseReviewButton } from '../discord/review';
import { runOutcome } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, { action, requestNumber }: InteractionHandler.ParseResult<this>) {
		const actor = toActor(interaction);
		if (!actor) return runOutcome(interaction, fail({ code: 'not-a-reviewer' }));

		if (action === 'approve') {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			return runOutcome(interaction, approveRequest(this.container.payMe, actor, requestNumber));
		}

		const checked = checkReviewer(this.container.payMe, actor, requestNumber);
		if (!checked.ok) return runOutcome(interaction, checked);
		return interaction.showModal(buildReasonModal(action, requestNumber));
	}

	public override parse(interaction: ButtonInteraction) {
		const parsed = parseReviewButton(interaction.customId);
		return parsed ? this.some(parsed) : this.none();
	}
}
