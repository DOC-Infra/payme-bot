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
import { requestForm, type Actor, type Job, type TaskForm } from '../core';

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
 * When the Tasks don't fit on one form, asks the actor to pick a Job first.
 */
export function openRequestForm(interaction: FormInteraction, jobId: number | null, employee: Actor | null = null) {
	return async (actor: Actor) => {
		const other = employee && employee.userId !== actor.userId ? employee : null;
		const form = requestForm(container.payMe, actor, jobId, other ?? actor);
		if (!form.ok) return form;
		const employeeUserId = other?.userId ?? null;
		if (form.value.kind === 'jobs') await askForJob(interaction, employeeUserId, form.value.jobs);
		else await interaction.showModal(buildRequestModal(form.value, employeeUserId));
		return null;
	};
}

async function askForJob(interaction: FormInteraction, employeeUserId: string | null, jobs: readonly Job[]) {
	const select = new StringSelectMenuBuilder()
		.setCustomId(withUserId(requestJobSelectId, employeeUserId))
		.setPlaceholder('Choose a Job')
		.addOptions(jobs.map((job) => ({ label: job.name, value: String(job.id) })));
	const who = employeeUserId ? `<@${employeeUserId}> has` : 'You have';
	await interaction.reply({
		content: `${who} more Tasks than one form can list. Pick the Job to request payment under.`,
		components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
		flags: MessageFlags.Ephemeral,
		allowedMentions: { parse: [] }
	});
}

function buildRequestModal(form: TaskForm, employeeUserId: string | null): ModalBuilder {
	const taskSelect = new StringSelectMenuBuilder()
		.setCustomId(fieldIds.task)
		.setPlaceholder('Choose a Task')
		.setRequired(true)
		.addOptions(form.tasks.map((task) => ({ label: task.name, value: String(task.id), description: task.description })));
	const notes = new TextInputBuilder()
		.setCustomId(fieldIds.notes)
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(form.notesRequired)
		.setMaxLength(1000);
	const link = new TextInputBuilder().setCustomId(fieldIds.link).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500);
	const files = new FileUploadBuilder().setCustomId(fieldIds.files).setRequired(false).setMaxValues(10);

	return new ModalBuilder()
		.setCustomId(withUserId(requestModalId, employeeUserId))
		.setTitle(employeeUserId ? 'Payment Request for an Employee' : 'Payment Request')
		.addLabelComponents(
			new LabelBuilder().setLabel('Task').setStringSelectMenuComponent(taskSelect),
			new LabelBuilder().setLabel('Notes').setDescription(form.notesHint).setTextInputComponent(notes),
			new LabelBuilder().setLabel('Link').setDescription(`Optional. ${form.evidenceHint}`).setTextInputComponent(link),
			new LabelBuilder().setLabel('Files').setDescription(`Optional screenshots. ${form.evidenceHint}`).setFileUploadComponent(files)
		);
}
