import { ButtonBuilder, ButtonStyle, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { encodeCustomId } from './customIds';

export const reportFieldIds = { from: 'from', to: 'to' } as const;

export function reportButton(month: string): ButtonBuilder {
	return new ButtonBuilder()
		.setCustomId(encodeCustomId({ kind: 'appropriation-report-button', month }))
		.setLabel('Report')
		.setStyle(ButtonStyle.Secondary);
}

/** Asks for the months to report on, starting with the month being viewed. */
export function buildReportModal(month: string): ModalBuilder {
	const monthInput = (id: string) =>
		new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Short).setRequired(true).setMinLength(7).setMaxLength(7).setValue(month);
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'appropriation-report-modal' }))
		.setTitle('Appropriation report')
		.addLabelComponents(
			new LabelBuilder()
				.setLabel('From')
				.setDescription('The first month, like 2026-01.')
				.setTextInputComponent(monthInput(reportFieldIds.from)),
			new LabelBuilder().setLabel('To').setDescription('The last month, like 2026-11.').setTextInputComponent(monthInput(reportFieldIds.to))
		);
}
