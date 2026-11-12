import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { hireEmployee } from '../core';
import { fetchActor } from '../discord/actor';
import { userIdFrom } from '../discord/customIds';
import { hireModalId, minecraftFieldId } from '../discord/hireModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, hireeUserId: string) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const hiree = await fetchActor(interaction, hireeUserId);
		const minecraftName = interaction.fields.getTextInputValue(minecraftFieldId).trim();
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) => hireEmployee(this.container.payMe, actor, hiree, minecraftName));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const hireeUserId = userIdFrom(hireModalId, interaction.customId);
		return hireeUserId ? this.some(hireeUserId) : this.none();
	}
}
