import { FileUploadBuilder, LabelBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { formatAmount, type Task } from '../core';

export const requestModalId = 'request';
export const fieldIds = { task: 'task', notes: 'notes', link: 'link', files: 'files' } as const;

export function buildRequestModal(tasks: readonly Task[]): ModalBuilder {
	const taskSelect = new StringSelectMenuBuilder()
		.setCustomId(fieldIds.task)
		.setPlaceholder('Choose a Task')
		.setRequired(true)
		.addOptions(tasks.map((task) => ({ label: task.name, value: String(task.id), description: `Rate ${formatAmount(task.rate)}` })));
	const notes = new TextInputBuilder().setCustomId(fieldIds.notes).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
	const link = new TextInputBuilder().setCustomId(fieldIds.link).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500);
	const files = new FileUploadBuilder().setCustomId(fieldIds.files).setRequired(false).setMaxValues(10);

	return new ModalBuilder()
		.setCustomId(requestModalId)
		.setTitle('Payment Request')
		.addLabelComponents(
			new LabelBuilder().setLabel('Task').setStringSelectMenuComponent(taskSelect),
			new LabelBuilder().setLabel('Notes').setDescription('What did you do?').setTextInputComponent(notes),
			new LabelBuilder().setLabel('Link').setDescription('Optional. A link or a file is required.').setTextInputComponent(link),
			new LabelBuilder().setLabel('Files').setDescription('Optional screenshots. A link or a file is required.').setFileUploadComponent(files)
		);
}
