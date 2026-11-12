import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { decodeCustomId } from '../discord/customIds';
import { buildClaimTicketModal } from '../discord/requestModal';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction) {
		await interaction.showModal(buildClaimTicketModal());
	}

	public override parse(interaction: ButtonInteraction) {
		return decodeCustomId(interaction.customId)?.kind === 'claim-ticket-button' ? this.some() : this.none();
	}
}
