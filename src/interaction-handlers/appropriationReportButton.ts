import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { requireLeadership } from '../core';
import { buildReportModal } from '../discord/appropriation';
import { decodeCustomId } from '../discord/customIds';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, month: InteractionHandler.ParseResult<this>) {
		await runAsActor(interaction, { code: 'not-permitted' }, async (actor) => {
			const refused = requireLeadership(payMeOf(interaction), actor);
			if (refused) return refused;
			await interaction.showModal(buildReportModal(month));
			return null;
		});
	}

	public override parse(interaction: ButtonInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'appropriation-report-button' ? this.some(id.month) : this.none();
	}
}
