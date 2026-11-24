import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { linkEmployee } from '../core';
import { fetchActor } from '../discord/actor';
import { decodeCustomId } from '../discord/customIds';
import { minecraftFieldId } from '../discord/hireModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction, { userId, channelId }: { userId: string; channelId: string }) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const linked = await fetchActor(interaction, userId);
		const minecraftName = interaction.fields.getTextInputValue(minecraftFieldId).trim();
		await runAsActor(interaction, { code: 'not-permitted' }, (actor, payMe) => linkEmployee(payMe, actor, linked, minecraftName, channelId));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'link-modal' ? this.some({ userId: id.userId, channelId: id.channelId }) : this.none();
	}
}
