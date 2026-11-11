import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { buildClaimTicketModal, claimTicketButtonId } from '../discord/requestModal';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction) {
		await interaction.showModal(buildClaimTicketModal());
	}

	public override parse(interaction: ButtonInteraction) {
		return interaction.customId === claimTicketButtonId ? this.some() : this.none();
	}
}
