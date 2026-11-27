import { ButtonBuilder, ButtonStyle, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { disbursementLabel, type DisbursementAction } from '../core';
import { encodeCustomId, type DisbursementButton } from './customIds';

export const declineReasonFieldId = 'reason';

const labels: Record<DisbursementButton, [string, ButtonStyle]> = {
	withdraw: ['Withdraw', ButtonStyle.Secondary],
	show: ['Open', ButtonStyle.Secondary],
	paid: ['Mark paid', ButtonStyle.Success],
	decline: ['Decline', ButtonStyle.Danger]
};

export function disbursementButton(disbursementNumber: number, action: DisbursementButton, label = labels[action][0]): ButtonBuilder {
	return new ButtonBuilder()
		.setCustomId(encodeCustomId({ kind: 'disbursement-button', action, disbursementNumber }))
		.setLabel(label)
		.setStyle(labels[action][1]);
}

/** The buttons on a Disbursement's public card. */
export function disbursementButtons(disbursementNumber: number, actions: readonly DisbursementAction[]): ButtonBuilder[] {
	return actions.map((action) => disbursementButton(disbursementNumber, action));
}

export function settleDisbursementButtons(disbursementNumber: number): ButtonBuilder[] {
	return [disbursementButton(disbursementNumber, 'paid'), disbursementButton(disbursementNumber, 'decline')];
}

export function buildDeclineModal(disbursementNumber: number): ModalBuilder {
	const reason = new TextInputBuilder().setCustomId(declineReasonFieldId).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'disbursement-decline-modal', disbursementNumber }))
		.setTitle(`Decline ${disbursementLabel(disbursementNumber)}`)
		.addLabelComponents(new LabelBuilder().setLabel('Reason').setDescription('Shown on the public card.').setTextInputComponent(reason));
}
