import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { PayoutAction } from '../core';
import { encodeCustomId, type PayoutButton } from './customIds';
import { disbursementButton } from './disbursements';

export function payoutActionButtons(actions: readonly PayoutAction[]): ButtonBuilder[] {
	return actions.map((action) => {
		if (action.kind === 'generate')
			return button({ action: 'generate', employeeUserId: action.employeeUserId }, action.label, ButtonStyle.Primary);
		if (action.kind === 'show') return button({ action: 'show', payoutNumber: action.payoutNumber }, action.label, ButtonStyle.Secondary);
		return disbursementButton(action.disbursementNumber, 'show', action.label);
	});
}

export function settleButtons(payoutNumber: number, revision: number): ButtonBuilder[] {
	return [
		button({ action: 'paid', payoutNumber, revision }, 'Mark paid', ButtonStyle.Success),
		button({ action: 'discard', payoutNumber, revision }, 'Discard', ButtonStyle.Danger)
	];
}

export function buttonRows(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let start = 0; start < buttons.length; start += 5) {
		rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(start, start + 5)));
	}
	return rows;
}

function button(payout: PayoutButton, label: string, style: ButtonStyle): ButtonBuilder {
	return new ButtonBuilder()
		.setCustomId(encodeCustomId({ kind: 'payout-button', ...payout }))
		.setLabel(label)
		.setStyle(style);
}
