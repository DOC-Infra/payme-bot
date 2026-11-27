import { ButtonBuilder, ButtonStyle, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { disbursementLabel, type DisbursementAction } from '../core';
import { encodeCustomId, type DisbursementButton } from './customIds';

export const declineReasonFieldId = 'reason';

const looks: Record<DisbursementButton, { label: string; style: ButtonStyle }> = {
	withdraw: { label: 'Withdraw', style: ButtonStyle.Secondary },
	show: { label: 'Open', style: ButtonStyle.Secondary },
	paid: { label: 'Mark paid', style: ButtonStyle.Success },
	decline: { label: 'Decline', style: ButtonStyle.Danger }
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
