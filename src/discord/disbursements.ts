import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { DisbursementAction } from '../core';
import { encodeCustomId } from './customIds';

export function disbursementButtons(disbursementNumber: number, actions: readonly DisbursementAction[]): ButtonBuilder[] {
	return actions.map((action) =>
		new ButtonBuilder()
			.setCustomId(encodeCustomId({ kind: 'disbursement-button', action, disbursementNumber }))
			.setLabel('Withdraw')
			.setStyle(ButtonStyle.Secondary)
	);
}
