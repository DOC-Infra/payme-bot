import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { UserSelectMenuInteraction } from 'discord.js';
import { decodeCustomId } from '../discord/customIds';
import { startRequest } from '../discord/requestModal';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.SelectMenu
})
export class MenuHandler extends InteractionHandler {
	public async run(interaction: UserSelectMenuInteraction) {
		await startRequest(interaction, interaction.values[0]);
	}

	public override parse(interaction: UserSelectMenuInteraction) {
		return decodeCustomId(interaction.customId)?.kind === 'dashboard-request-for' ? this.some() : this.none();
	}
}
