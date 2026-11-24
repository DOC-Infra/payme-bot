import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { setEmployeeCategory } from '../core';
import { decodeCustomId } from '../discord/customIds';
import { employeeCategoryFieldId } from '../discord/dashboard';
import { runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const categoryId = interaction.fields.getSelectedChannels(employeeCategoryFieldId, true).first()!.id;
		await runAsActor(interaction, { code: 'not-permitted' }, (actor, payMe) => setEmployeeCategory(payMe, actor, categoryId));
	}

	public override parse(interaction: ModalSubmitInteraction) {
		return decodeCustomId(interaction.customId)?.kind === 'settings-modal' ? this.some() : this.none();
	}
}
