import { ButtonBuilder, ButtonStyle, FileUploadBuilder, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { requestLabel, type EntryAction } from '../core';
import { encodeCustomId, type EntryButton } from './customIds';

export const amendFieldIds = { notes: 'notes', link: 'link', files: 'files' } as const;

export function entryButtons(requestNumber: number, actions: readonly EntryAction[]): ButtonBuilder[] {
	return actions.map((action) =>
		action === 'amend'
			? entryButton('amend', requestNumber).setLabel('Amend & resubmit').setStyle(ButtonStyle.Primary)
			: entryButton('withdraw', requestNumber).setLabel('Withdraw').setStyle(ButtonStyle.Secondary)
	);
}

export function confirmWithdrawButton(requestNumber: number): ButtonBuilder {
	return entryButton('confirm-withdraw', requestNumber)
		.setLabel(`Withdraw ${requestLabel(requestNumber)}`)
		.setStyle(ButtonStyle.Danger);
}

function entryButton(action: EntryButton, requestNumber: number): ButtonBuilder {
	return new ButtonBuilder().setCustomId(encodeCustomId({ kind: 'entry-button', action, requestNumber }));
}

export function buildAmendModal(requestNumber: number, notesRequired: boolean): ModalBuilder {
	const notes = new TextInputBuilder()
		.setCustomId(amendFieldIds.notes)
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(notesRequired)
		.setMaxLength(1000);
	const notesHint = notesRequired ? 'What did you change or add?' : 'What did you change or add? Optional.';
	const link = new TextInputBuilder().setCustomId(amendFieldIds.link).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500);
	const files = new FileUploadBuilder().setCustomId(amendFieldIds.files).setRequired(false).setMaxValues(10);

	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'amend-modal', requestNumber }))
		.setTitle(`Amend ${requestLabel(requestNumber)}`)
		.addLabelComponents(
			new LabelBuilder().setLabel('Notes').setDescription(notesHint).setTextInputComponent(notes),
			new LabelBuilder().setLabel('Link').setDescription('Optional.').setTextInputComponent(link),
			new LabelBuilder().setLabel('Files').setDescription('Optional screenshots.').setFileUploadComponent(files)
		);
}
