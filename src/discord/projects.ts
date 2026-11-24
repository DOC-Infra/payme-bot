import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	CheckboxBuilder,
	LabelBuilder,
	ModalBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
	UserSelectMenuBuilder
} from 'discord.js';
import { formatAmount, plainAmount, shareLabel, type Job, type ProjectAction, type ProjectChoice, type Share } from '../core';
import { encodeCustomId, type ProjectButton } from './customIds';

export const projectFieldIds = { name: 'name', job: 'job', amount: 'amount', employee: 'employee', note: 'note', remove: 'remove' } as const;

const actionLabels: Record<ProjectAction, [string, ButtonStyle]> = {
	share: ['Give Share', ButtonStyle.Primary],
	'change-share': ['Change Share', ButtonStyle.Secondary],
	fund: ['Add funding', ButtonStyle.Secondary],
	close: ['Close', ButtonStyle.Danger]
};

export function projectActionButtons(projectId: number, actions: readonly ProjectAction[]): ButtonBuilder[] {
	return actions.map((action) => {
		const [label, style] = actionLabels[action];
		return button({ action, projectId }, label, style);
	});
}

export function newProjectButton(): ButtonBuilder {
	return button({ action: 'create' }, 'New Project', ButtonStyle.Primary);
}

export function confirmCloseButton(projectId: number, name: string): ButtonBuilder {
	return button({ action: 'confirm-close', projectId }, truncate(`Close ${name}`, 80), ButtonStyle.Danger);
}

export function projectSelectRow(projects: readonly ProjectChoice[]): ActionRowBuilder<StringSelectMenuBuilder> {
	const select = new StringSelectMenuBuilder()
		.setCustomId(encodeCustomId({ kind: 'project-select' }))
		.setPlaceholder('Open a Project')
		.addOptions(projects.map((project) => ({ label: truncate(project.label, 100), value: String(project.id) })));
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

export function shareSelectRow(projectId: number, shares: readonly Share[], nameOf: (userId: string) => string) {
	const select = new StringSelectMenuBuilder()
		.setCustomId(encodeCustomId({ kind: 'share-select', projectId }))
		.setPlaceholder('Choose a Share')
		.addOptions(
			shares.map((share) => ({
				label: truncate(`${shareLabel(share.id)}, ${nameOf(share.employeeUserId)}: ${formatAmount(share.amount)}`, 100),
				description: share.note ? truncate(share.note, 100) : undefined,
				value: String(share.id)
			}))
		);
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

export function buildCreateProjectModal(jobs: readonly Job[]): ModalBuilder {
	const job = new StringSelectMenuBuilder()
		.setCustomId(projectFieldIds.job)
		.setPlaceholder('Choose a Job')
		.setRequired(true)
		.addOptions(jobs.map((entry) => ({ label: truncate(entry.name, 100), value: String(entry.id) })));
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'project-modal', action: 'create' }))
		.setTitle('New Project')
		.addLabelComponents(
			new LabelBuilder().setLabel('Name').setTextInputComponent(textInput(projectFieldIds.name, true, 100)),
			new LabelBuilder().setLabel('Job').setStringSelectMenuComponent(job),
			new LabelBuilder()
				.setLabel('Budget')
				.setDescription('The opening budget, like 1500 or 12.5.')
				.setTextInputComponent(textInput(projectFieldIds.amount, true, 20))
		);
}

export function buildFundModal(projectId: number, name: string): ModalBuilder {
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'project-modal', action: 'fund', projectId }))
		.setTitle(truncate(`Add funding to ${name}`, 45))
		.addLabelComponents(
			new LabelBuilder()
				.setLabel('Amount')
				.setDescription('The amount to add, like 1500 or 12.5.')
				.setTextInputComponent(textInput(projectFieldIds.amount, true, 20))
		);
}

export function buildGiveShareModal(projectId: number, name: string): ModalBuilder {
	const employee = new UserSelectMenuBuilder().setCustomId(projectFieldIds.employee).setRequired(true).setMaxValues(1);
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'project-modal', action: 'share', projectId }))
		.setTitle(truncate(`Give a Share of ${name}`, 45))
		.addLabelComponents(
			new LabelBuilder().setLabel('Employee').setUserSelectMenuComponent(employee),
			new LabelBuilder()
				.setLabel('Amount')
				.setDescription('Like 1500 or 12.5.')
				.setTextInputComponent(textInput(projectFieldIds.amount, true, 20)),
			new LabelBuilder()
				.setLabel('Note')
				.setDescription('Optional. What the Share is for.')
				.setTextInputComponent(textInput(projectFieldIds.note, false, 1000, TextInputStyle.Paragraph))
		);
}

export function buildEditShareModal(share: Share): ModalBuilder {
	const amount = textInput(projectFieldIds.amount, true, 20).setValue(plainAmount(share.amount));
	const note = textInput(projectFieldIds.note, false, 1000, TextInputStyle.Paragraph);
	if (share.note) note.setValue(share.note);
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'project-modal', action: 'edit-share', shareId: share.id }))
		.setTitle(`Change ${shareLabel(share.id)}`)
		.addLabelComponents(
			new LabelBuilder().setLabel('Amount').setTextInputComponent(amount),
			new LabelBuilder().setLabel('Note').setTextInputComponent(note),
			new LabelBuilder()
				.setLabel('Remove this Share')
				.setDescription('Returns its amount to the budget. Amount and note are ignored.')
				.setCheckboxComponent(new CheckboxBuilder().setCustomId(projectFieldIds.remove))
		);
}

function textInput(customId: string, required: boolean, maxLength: number, style = TextInputStyle.Short): TextInputBuilder {
	return new TextInputBuilder().setCustomId(customId).setStyle(style).setRequired(required).setMaxLength(maxLength);
}

function button(project: ProjectButton, label: string, style: ButtonStyle): ButtonBuilder {
	return new ButtonBuilder()
		.setCustomId(encodeCustomId({ kind: 'project-button', ...project }))
		.setLabel(label)
		.setStyle(style);
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
