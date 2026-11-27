import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { withdrawDisbursement } from '../core';
import { decodeCustomId } from '../discord/customIds';
import { acknowledge, runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, disbursementNumber: InteractionHandler.ParseResult<this>) {
		await acknowledge(interaction);
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) => withdrawDisbursement(payMeOf(interaction), actor, disbursementNumber));
	}

	public override parse(interaction: ButtonInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'disbursement-button' ? this.some(id.disbursementNumber) : this.none();
	}
}
