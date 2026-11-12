import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { PayoutAction } from '../core';
import { encodeCustomId, type PayoutButton } from './customIds';

export function payoutActionButtons(actions: readonly PayoutAction[]): ButtonBuilder[] {
	return actions.map((action) =>
		action.kind === 'generate'
			? button({ action: 'generate', employeeUserId: action.employeeUserId }, action.label, ButtonStyle.Primary)
			: button({ action: 'show', payoutNumber: action.payoutNumber }, action.label, ButtonStyle.Secondary)
	);
}

export function settleButtons(payoutNumber: number): ButtonBuilder[] {
	return [
		button({ action: 'paid', payoutNumber }, 'Mark paid', ButtonStyle.Success),
		button({ action: 'discard', payoutNumber }, 'Discard', ButtonStyle.Danger)
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
