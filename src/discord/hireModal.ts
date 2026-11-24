import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { encodeCustomId } from './customIds';

export const minecraftFieldId = 'minecraft';

export function buildHireModal(hireeUserId: string): ModalBuilder {
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'hire-modal', hireeUserId }))
		.setTitle('Hire Employee')
		.addLabelComponents(minecraftLabel(null));
}

/** Asks for the Minecraft Name of a member being linked to their existing channel, filled in when they are already an Employee. */
export function buildLinkModal(userId: string, channelId: string, minecraftName: string | null): ModalBuilder {
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'link-modal', userId, channelId }))
		.setTitle('Link Employee')
		.addLabelComponents(minecraftLabel(minecraftName));
}

function minecraftLabel(current: string | null): LabelBuilder {
	const minecraft = new TextInputBuilder()
		.setCustomId(minecraftFieldId)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMinLength(3)
		.setMaxLength(16)
		.setPlaceholder('Alex_42');
	if (current) minecraft.setValue(current);
	return new LabelBuilder()
		.setLabel('Minecraft Name')
		.setDescription('The in-game name they are paid to: 3 to 16 letters, digits or underscores.')
		.setTextInputComponent(minecraft);
}
