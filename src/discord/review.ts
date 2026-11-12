import { ActionRowBuilder, ButtonBuilder, ButtonStyle, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { requestLabel } from '../core';
import { encodeCustomId, type ReasonAction, type ReviewAction } from './customIds';

export const reasonFieldId = 'reason';

export function reviewButtons(requestNumber: number): ButtonBuilder[] {
	const button = (action: ReviewAction, label: string, style: ButtonStyle) =>
		new ButtonBuilder()
			.setCustomId(encodeCustomId({ kind: 'review-button', action, requestNumber }))
			.setLabel(label)
			.setStyle(style);
	return [
		button('approve', 'Approve', ButtonStyle.Success),
		button('reject', 'Reject', ButtonStyle.Secondary),
		button('deny', 'Deny', ButtonStyle.Danger)
	];
}

export function buildReasonModal(action: ReasonAction, requestNumber: number): ModalBuilder {
	const reason = new TextInputBuilder().setCustomId(reasonFieldId).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
	const description = action === 'reject' ? 'What should the Employee change before resubmitting?' : 'Why will this request not be paid?';
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'reason-modal', action, requestNumber }))
		.setTitle(`${action === 'reject' ? 'Reject' : 'Deny'} ${requestLabel(requestNumber)}`)
		.addLabelComponents(new LabelBuilder().setLabel('Reason').setDescription(description).setTextInputComponent(reason));
}

export function reviewRow(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
	return buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [];
}
