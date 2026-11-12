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
	/** `employeeUserId` is null when the actor picked a Job to request payment for themselves. */
	public async run(interaction: StringSelectMenuInteraction, employeeUserId: string | null) {
		const jobId = Number(interaction.values[0]);
		if (employeeUserId === null) return runAsActor(interaction, { code: 'not-hired' }, openRequestForm(interaction, jobId));
		const employee = await fetchActor(interaction, employeeUserId);
		return runAsActor(interaction, { code: 'not-their-manager' }, openRequestForm(interaction, jobId, employee));
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		const employeeUserId = userIdFrom(requestJobSelectId, interaction.customId);
		return employeeUserId === undefined ? this.none() : this.some(employeeUserId);
	}
}
