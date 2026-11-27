import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { appropriationReport } from '../core';
import { reportFieldIds } from '../discord/appropriation';
import { decodeCustomId } from '../discord/customIds';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const { fields } = interaction;
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) =>
			appropriationReport(
				payMeOf(interaction),
				actor,
				fields.getTextInputValue(reportFieldIds.from),
				fields.getTextInputValue(reportFieldIds.to)
			)
		);
	}

	public override parse(interaction: ModalSubmitInteraction) {
		return decodeCustomId(interaction.customId)?.kind === 'appropriation-report-modal' ? this.some() : this.none();
	}
}
