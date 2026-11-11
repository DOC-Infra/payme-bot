import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { PayoutAction } from '../core';

export type PayoutButton = { action: 'generate'; employeeUserId: string } | { action: 'show' | 'paid' | 'discard'; payoutNumber: number };

const prefix = 'payout';

export function payoutActionButtons(actions: readonly PayoutAction[]): ButtonBuilder[] {
	return actions.map((action) =>
		action.kind === 'generate'
			? button(`generate:${action.employeeUserId}`, action.label, ButtonStyle.Primary)
			: button(`show:${action.payoutNumber}`, action.label, ButtonStyle.Secondary)
	);
}

export function settleButtons(payoutNumber: number): ButtonBuilder[] {
	return [button(`paid:${payoutNumber}`, 'Mark paid', ButtonStyle.Success), button(`discard:${payoutNumber}`, 'Discard', ButtonStyle.Danger)];
}

export function parsePayoutButton(customId: string): PayoutButton | null {
	const [idPrefix, action, id] = customId.split(':');
	if (idPrefix !== prefix || !/^\d+$/.test(id ?? '')) return null;
	if (action === 'generate') return { action, employeeUserId: id };
	if (action === 'show' || action === 'paid' || action === 'discard') return { action, payoutNumber: Number(id) };
	return null;
}

/** Up to 25 buttons, five to a row. */
export function buttonRows(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let start = 0; start < Math.min(buttons.length, 25); start += 5) {
		rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(start, start + 5)));
	}
	return rows;
}

function button(id: string, label: string, style: ButtonStyle): ButtonBuilder {
	return new ButtonBuilder().setCustomId(`${prefix}:${id}`).setLabel(label).setStyle(style);
}
