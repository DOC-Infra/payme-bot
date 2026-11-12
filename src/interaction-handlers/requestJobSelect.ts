import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { StringSelectMenuInteraction } from 'discord.js';
import { fetchActor } from '../discord/actor';
import { userIdFrom } from '../discord/customIds';
import { openRequestForm, requestJobSelectId } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.SelectMenu
})
export class MenuHandler extends InteractionHandler {
	public async run(interaction: StringSelectMenuInteraction, employeeUserId: string) {
		const employee = await fetchActor(interaction, employeeUserId);
		await runAsActor(interaction, { code: 'not-their-manager' }, openRequestForm(interaction, Number(interaction.values[0]), employee));
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		const employeeUserId = userIdFrom(requestJobSelectId, interaction.customId);
		return employeeUserId ? this.some(employeeUserId) : this.none();
	}
}
