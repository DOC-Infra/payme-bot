import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { encodeCustomId } from './customIds';

export const minecraftFieldId = 'minecraft';

export function buildHireModal(hireeUserId: string): ModalBuilder {
	const minecraft = new TextInputBuilder()
		.setCustomId(minecraftFieldId)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMinLength(3)
		.setMaxLength(16)
		.setPlaceholder('Alex_42');
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'hire-modal', hireeUserId }))
		.setTitle('Hire Employee')
		.addLabelComponents(
			new LabelBuilder()
				.setLabel('Minecraft Name')
				.setDescription('The in-game name they are paid to: 3 to 16 letters, digits or underscores.')
				.setTextInputComponent(minecraft)
		);
}
