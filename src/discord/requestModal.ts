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
	MessageFlags,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type StringSelectMenuInteraction,
	type UserContextMenuCommandInteraction
} from 'discord.js';
import { withUserId } from './customIds';
import { formatAmount, requestForm, requestJobs, type Actor, type Job, type Task } from '../core';

export const requestModalId = 'request';
export const requestJobSelectId = 'request-job';
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

type FormInteraction = ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction | UserContextMenuCommandInteraction;

/**
 * Shows the actor the Payment Request form for `employee` (the actor themselves when null), or returns why they can't have one.
 * When filing for someone whose Tasks don't fit on one form, asks the actor to pick a Job first.
 */
export function openRequestForm(interaction: FormInteraction, jobId: number | null, employee: Actor | null = null) {
	return async (actor: Actor) => {
		const other = employee && employee.userId !== actor.userId ? employee : null;
		const form = requestForm(container.payMe, actor, jobId, other ?? actor);
		if (!form.ok && form.error.code === 'pick-a-job' && other) {
			await askForJob(interaction, other.userId, requestJobs(container.payMe, actor, other));
			return null;
		}
		if (!form.ok) return form;
		await interaction.showModal(buildRequestModal(form.value, other?.userId ?? null));
		return null;
	};
}

async function askForJob(interaction: FormInteraction, employeeUserId: string, jobs: readonly Job[]) {
	const select = new StringSelectMenuBuilder()
		.setCustomId(withUserId(requestJobSelectId, employeeUserId))
		.setPlaceholder('Choose a Job')
		.addOptions(jobs.slice(0, 25).map((job) => ({ label: job.name, value: String(job.id) })));
	await interaction.reply({
		content: `<@${employeeUserId}> has more Tasks than one form can list. Pick the Job to request payment under.`,
		components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
		flags: MessageFlags.Ephemeral,
		allowedMentions: { parse: [] }
	});
}

export function buildRequestModal(tasks: readonly Task[], employeeUserId: string | null = null): ModalBuilder {
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
		.setCustomId(withUserId(requestModalId, employeeUserId))
		.setTitle(employeeUserId ? 'Payment Request for an Employee' : 'Payment Request')
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
