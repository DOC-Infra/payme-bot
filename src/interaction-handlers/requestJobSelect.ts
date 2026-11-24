import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { StringSelectMenuInteraction } from 'discord.js';
import { fetchActorIn } from '../discord/actor';
import { decodeCustomId } from '../discord/customIds';
import { openRequestForm, takeHeldNotes } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';

interface Picking {
	home: string;
	employeeUserId: string | null;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.SelectMenu
})
export class MenuHandler extends InteractionHandler {
	public async run(interaction: StringSelectMenuInteraction, { home, employeeUserId }: Picking) {
		const jobId = Number(interaction.values[0]);
		const notes = takeHeldNotes(interaction.user.id);
		const employee = employeeUserId ? await fetchActorIn(home, employeeUserId) : null;
		const refusal = employee ? ({ code: 'not-their-manager' } as const) : ({ code: 'not-hired' } as const);
		return runAsActor(interaction, refusal, openRequestForm(interaction, home, jobId, employee, notes), home);
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'request-job-select' ? this.some({ home: id.home, employeeUserId: id.employeeUserId }) : this.none();
	}
}
