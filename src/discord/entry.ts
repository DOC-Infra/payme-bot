import { ButtonBuilder, ButtonStyle, FileUploadBuilder, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { requestLabel, type EntryAction } from '../core';

export type EntryButton = EntryAction | 'confirm-withdraw';

const buttonPrefix = 'entry';
const modalPrefix = 'amend';
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
	return new ButtonBuilder().setCustomId(`${buttonPrefix}:${action}:${requestNumber}`);
}

export function parseEntryButton(customId: string): { action: EntryButton; requestNumber: number } | null {
	const [prefix, action, number] = customId.split(':');
	const known = (['amend', 'withdraw', 'confirm-withdraw'] as const).find((candidate) => candidate === action);
	if (prefix !== buttonPrefix || !known || !/^\d+$/.test(number ?? '')) return null;
	return { action: known, requestNumber: Number(number) };
}

export function buildAmendModal(requestNumber: number): ModalBuilder {
	const notes = new TextInputBuilder().setCustomId(amendFieldIds.notes).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
	const link = new TextInputBuilder().setCustomId(amendFieldIds.link).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500);
	const files = new FileUploadBuilder().setCustomId(amendFieldIds.files).setRequired(false).setMaxValues(10);

	return new ModalBuilder()
		.setCustomId(`${modalPrefix}:${requestNumber}`)
		.setTitle(`Amend ${requestLabel(requestNumber)}`)
		.addLabelComponents(
			new LabelBuilder().setLabel('Notes').setDescription('What did you change or add?').setTextInputComponent(notes),
			new LabelBuilder().setLabel('Link').setDescription('Optional.').setTextInputComponent(link),
			new LabelBuilder().setLabel('Files').setDescription('Optional screenshots.').setFileUploadComponent(files)
		);
}

export function parseAmendModal(customId: string): number | null {
	const [prefix, number] = customId.split(':');
	return prefix === modalPrefix && /^\d+$/.test(number ?? '') ? Number(number) : null;
}
