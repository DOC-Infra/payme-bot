import { ActionRowBuilder, ButtonBuilder, ButtonStyle, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { requestLabel } from '../core';

export type ReviewAction = 'approve' | 'reject' | 'deny';
export type ReasonAction = Exclude<ReviewAction, 'approve'>;

const buttonPrefix = 'review';
const modalPrefix = 'review-reason';
export const reasonFieldId = 'reason';

export function reviewButtons(requestNumber: number): ButtonBuilder[] {
	const button = (action: ReviewAction, label: string, style: ButtonStyle) =>
		new ButtonBuilder().setCustomId(`${buttonPrefix}:${action}:${requestNumber}`).setLabel(label).setStyle(style);
	return [
		button('approve', 'Approve', ButtonStyle.Success),
		button('reject', 'Reject', ButtonStyle.Secondary),
		button('deny', 'Deny', ButtonStyle.Danger)
	];
}

export function parseReviewButton(customId: string) {
	return parse(customId, buttonPrefix, ['approve', 'reject', 'deny']);
}

export function buildReasonModal(action: ReasonAction, requestNumber: number): ModalBuilder {
	const reason = new TextInputBuilder().setCustomId(reasonFieldId).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
	const description = action === 'reject' ? 'What should the Employee change before resubmitting?' : 'Why will this request not be paid?';
	return new ModalBuilder()
		.setCustomId(`${modalPrefix}:${action}:${requestNumber}`)
		.setTitle(`${action === 'reject' ? 'Reject' : 'Deny'} ${requestLabel(requestNumber)}`)
		.addLabelComponents(new LabelBuilder().setLabel('Reason').setDescription(description).setTextInputComponent(reason));
}

export function parseReasonModal(customId: string) {
	return parse(customId, modalPrefix, ['reject', 'deny']);
}

function parse<A extends ReviewAction>(customId: string, prefix: string, actions: readonly A[]): { action: A; requestNumber: number } | null {
	const [idPrefix, action, number] = customId.split(':');
	const known = actions.find((candidate) => candidate === action);
	if (idPrefix !== prefix || !known || !/^\d+$/.test(number ?? '')) return null;
	return { action: known, requestNumber: Number(number) };
}

export function reviewRow(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
	return buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [];
}
