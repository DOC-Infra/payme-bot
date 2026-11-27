import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { encodeCustomId, type PayoutButton } from './customIds';

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
