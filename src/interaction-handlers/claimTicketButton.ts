import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { ticketJobs } from '../core';
import { decodeCustomId } from '../discord/customIds';
import { buildClaimTicketModal } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction) {
		await runAsActor(interaction, { code: 'not-hired' }, async (actor) => {
			await interaction.showModal(buildClaimTicketModal(ticketJobs(payMeOf(interaction), actor)));
			return null;
		});
	}

	public override parse(interaction: ButtonInteraction) {
		return decodeCustomId(interaction.customId)?.kind === 'claim-ticket-button' ? this.some() : this.none();
	}
}
