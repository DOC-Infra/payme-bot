import { ButtonBuilder, ButtonStyle, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { disbursementLabel, type DisbursementAction, type DisbursementDecision } from '../core';
import { encodeCustomId, type DisbursementButton, type DisbursementReasonAction } from './customIds';

export const disbursementReasonFieldId = 'reason';

const looks: Record<DisbursementButton, { label: string; style: ButtonStyle }> = {
	withdraw: { label: 'Withdraw', style: ButtonStyle.Secondary },
	show: { label: 'Open', style: ButtonStyle.Secondary },
	paid: { label: 'Mark paid', style: ButtonStyle.Success },
	decline: { label: 'Decline', style: ButtonStyle.Danger },
	void: { label: 'Void', style: ButtonStyle.Danger }
};

export function disbursementButton(disbursementNumber: number, action: DisbursementButton, label = looks[action].label): ButtonBuilder {
	return new ButtonBuilder()
		.setCustomId(encodeCustomId({ kind: 'disbursement-button', action, disbursementNumber }))
		.setLabel(label)
		.setStyle(looks[action].style);
}

/** The buttons on a Disbursement's public card. */
export function disbursementButtons(disbursementNumber: number, actions: readonly DisbursementAction[]): ButtonBuilder[] {
	return actions.map((action) => disbursementButton(disbursementNumber, action));
}

/** Leadership's buttons on a Disbursement's private view. */
export function decisionButtons(disbursementNumber: number, actions: readonly DisbursementDecision[]): ButtonBuilder[] {
	return actions.map((action) => disbursementButton(disbursementNumber, action));
}

const reasonForms: Record<DisbursementReasonAction, { title: string; description: string }> = {
	decline: { title: 'Decline', description: 'Shown on the public card.' },
	void: { title: 'Void', description: 'What was recorded wrongly. Shown on the public card.' }
};

export function buildDisbursementReasonModal(action: DisbursementReasonAction, disbursementNumber: number): ModalBuilder {
	const reason = new TextInputBuilder()
		.setCustomId(disbursementReasonFieldId)
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true)
		.setMaxLength(1000);
	const { title, description } = reasonForms[action];
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'disbursement-reason-modal', action, disbursementNumber }))
		.setTitle(`${title} ${disbursementLabel(disbursementNumber)}`)
		.addLabelComponents(new LabelBuilder().setLabel('Reason').setDescription(description).setTextInputComponent(reason));
}
