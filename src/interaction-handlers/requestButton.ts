import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { employeeIdByChannel } from '../core';
import { fetchActor } from '../discord/actor';
import { decodeCustomId } from '../discord/customIds';
import { openRequestForm } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	/** In someone else's Employee Channel, the form is for that Employee. */
	public async run(interaction: ButtonInteraction) {
		const ownerId = employeeIdByChannel(payMeOf(interaction), interaction.channelId);
		if (ownerId === null || ownerId === interaction.user.id) {
			return runAsActor(interaction, { code: 'not-hired' }, openRequestForm(interaction, interaction.guildId!, null));
		}
		const employee = await fetchActor(interaction, ownerId);
		return runAsActor(interaction, { code: 'not-their-manager' }, openRequestForm(interaction, interaction.guildId!, null, employee));
	}

	public override parse(interaction: ButtonInteraction) {
		return decodeCustomId(interaction.customId)?.kind === 'request-button' ? this.some() : this.none();
	}
}
