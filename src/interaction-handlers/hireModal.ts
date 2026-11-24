import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { hireEmployee } from '../core';
import { fetchActor } from '../discord/actor';
import { decodeCustomId } from '../discord/customIds';
import { minecraftFieldId } from '../discord/hireModal';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, hireeUserId: string) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const hiree = await fetchActor(interaction, hireeUserId);
		const minecraftName = interaction.fields.getTextInputValue(minecraftFieldId).trim();
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) => hireEmployee(payMeOf(interaction), actor, hiree, minecraftName));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'hire-modal' ? this.some(id.hireeUserId) : this.none();
	}
}
