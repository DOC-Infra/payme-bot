import { ButtonBuilder, ButtonStyle, FileUploadBuilder, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { requestLabel, type AmendForm, type EntryAction } from '../core';
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

export function buildAmendModal(requestNumber: number, form: AmendForm): ModalBuilder {
	const notes = new TextInputBuilder()
		.setCustomId(amendFieldIds.notes)
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(form.notesRequired)
		.setMaxLength(1000);
	const link = new TextInputBuilder().setCustomId(amendFieldIds.link).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500);
	const files = new FileUploadBuilder().setCustomId(amendFieldIds.files).setRequired(false).setMaxValues(10);

	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'amend-modal', requestNumber }))
		.setTitle(`Amend ${requestLabel(requestNumber)}`)
		.addLabelComponents(
			new LabelBuilder().setLabel('Notes').setDescription(form.notesHint).setTextInputComponent(notes),
			new LabelBuilder().setLabel('Link').setDescription('Optional.').setTextInputComponent(link),
			new LabelBuilder().setLabel('Files').setDescription('Optional screenshots.').setFileUploadComponent(files)
		);
}
