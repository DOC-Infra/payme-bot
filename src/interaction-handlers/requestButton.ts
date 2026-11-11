import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { openRequestForm, requestButtonId } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction) {
		await runAsActor(interaction, { code: 'not-hired' }, openRequestForm(interaction, null));
	}

	public override parse(interaction: ButtonInteraction) {
		return interaction.customId === requestButtonId ? this.some() : this.none();
	}
}
