import { container } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	FileUploadBuilder,
	LabelBuilder,
	ModalBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ButtonInteraction,
	type ChatInputCommandInteraction
} from 'discord.js';
import { formatAmount, requestForm, type Actor, type Task } from '../core';

export const requestModalId = 'request';
export const requestButtonId = 'request-payment';
export const claimTicketButtonId = 'claim-ticket';
export const claimTicketModalId = 'claim-ticket';
export const ticketFieldId = 'ticket';
export const fieldIds = { task: 'task', notes: 'notes', link: 'link', files: 'files' } as const;

export function requestButtonRow(): ActionRowBuilder<ButtonBuilder> {
	const request = new ButtonBuilder().setCustomId(requestButtonId).setLabel('Request payment').setStyle(ButtonStyle.Primary);
	const claim = new ButtonBuilder().setCustomId(claimTicketButtonId).setLabel('Claim ticket').setStyle(ButtonStyle.Secondary);
	return new ActionRowBuilder<ButtonBuilder>().addComponents(request, claim);
}

export function buildClaimTicketModal(): ModalBuilder {
	const ticket = new TextInputBuilder()
		.setCustomId(ticketFieldId)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMinLength(5)
		.setMaxLength(5)
		.setPlaceholder('12345');
	return new ModalBuilder()
		.setCustomId(claimTicketModalId)
		.setTitle('Claim ticket')
		.addLabelComponents(
			new LabelBuilder().setLabel('Ticket number').setDescription('The 5-digit DOC ticket number.').setTextInputComponent(ticket)
		);
}

/** Shows the actor the Payment Request form, or returns why they can't have one. */
export function openRequestForm(interaction: ChatInputCommandInteraction | ButtonInteraction, jobId: number | null) {
	return async (actor: Actor) => {
		const form = requestForm(container.payMe, actor, jobId);
		if (!form.ok) return form;
		await interaction.showModal(buildRequestModal(form.value));
		return null;
	};
}

export function buildRequestModal(tasks: readonly Task[]): ModalBuilder {
	const taskSelect = new StringSelectMenuBuilder()
		.setCustomId(fieldIds.task)
		.setPlaceholder('Choose a Task')
		.setRequired(true)
		.addOptions(tasks.map((task) => ({ label: task.name, value: String(task.id), description: taskDescription(task) })));
	const notesRequired = tasks.every((task) => task.notesRequired);
	const notes = new TextInputBuilder().setCustomId(fieldIds.notes).setStyle(TextInputStyle.Paragraph).setRequired(notesRequired).setMaxLength(1000);
	const notesHint = notesRequired
		? 'What did you do?'
		: tasks.some((task) => task.notesRequired)
			? 'What did you do? Required unless the Task says otherwise.'
			: 'What did you do? Optional.';
	const link = new TextInputBuilder().setCustomId(fieldIds.link).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500);
	const required = tasks.every((task) => task.evidenceRequired)
		? 'A link or a file is required.'
		: 'A link or a file is required unless the Task says otherwise.';
	const files = new FileUploadBuilder().setCustomId(fieldIds.files).setRequired(false).setMaxValues(10);

	return new ModalBuilder()
		.setCustomId(requestModalId)
		.setTitle('Payment Request')
		.addLabelComponents(
			new LabelBuilder().setLabel('Task').setStringSelectMenuComponent(taskSelect),
			new LabelBuilder().setLabel('Notes').setDescription(notesHint).setTextInputComponent(notes),
			new LabelBuilder().setLabel('Link').setDescription(`Optional. ${required}`).setTextInputComponent(link),
			new LabelBuilder().setLabel('Files').setDescription(`Optional screenshots. ${required}`).setFileUploadComponent(files)
		);
}

function taskDescription(task: Task): string {
	const exemptions = [!task.evidenceRequired && 'no link or file needed', !task.notesRequired && 'no notes needed'].filter(Boolean);
	return [`Rate ${formatAmount(task.rate)}`, ...exemptions].join(', ');
}
