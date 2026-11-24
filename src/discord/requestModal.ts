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
	type MessageContextMenuCommandInteraction,
	type StringSelectMenuInteraction,
	type UserContextMenuCommandInteraction,
	type UserSelectMenuInteraction
} from 'discord.js';
import { encodeCustomId } from './customIds';
import { fail, requestForm, type Actor, type Job, type PayMe, type TaskForm } from '../core';
import { fetchActorIn } from './actor';
import { homeFor, serverName } from './home';
import { runAsActor, runOutcome } from './runner';

export const ticketFieldId = 'ticket';
export const jobFieldId = 'job';
export const fieldIds = { task: 'task', notes: 'notes', link: 'link', files: 'files' } as const;

export function requestButtonRow(): ActionRowBuilder<ButtonBuilder> {
	const request = new ButtonBuilder()
		.setCustomId(encodeCustomId({ kind: 'request-button' }))
		.setLabel('Request payment')
		.setStyle(ButtonStyle.Primary);
	const claim = new ButtonBuilder()
		.setCustomId(encodeCustomId({ kind: 'claim-ticket-button' }))
		.setLabel('Claim ticket')
		.setStyle(ButtonStyle.Secondary);
	return new ActionRowBuilder<ButtonBuilder>().addComponents(request, claim);
}

/** The ticket claim form, with a Job to pick when the claimer holds more than one Job with the ticket Task. */
export function buildClaimTicketModal(jobs: readonly Job[]): ModalBuilder {
	const ticket = new TextInputBuilder()
		.setCustomId(ticketFieldId)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMinLength(5)
		.setMaxLength(5)
		.setPlaceholder('12345');
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'claim-ticket-modal' }))
		.setTitle('Claim ticket')
		.addLabelComponents(
			new LabelBuilder().setLabel('Ticket number').setDescription('The 5-digit DOC ticket number.').setTextInputComponent(ticket),
			...(jobs.length > 0 ? [new LabelBuilder().setLabel('Job').setStringSelectMenuComponent(jobSelect(jobs))] : [])
		);
}

function jobSelect(jobs: readonly Job[]): StringSelectMenuBuilder {
	return new StringSelectMenuBuilder()
		.setCustomId(jobFieldId)
		.setPlaceholder('Choose the Job the work was for')
		.setRequired(true)
		.addOptions(jobs.map((job) => ({ label: job.name, value: String(job.id) })));
}

type FormInteraction =
	| ChatInputCommandInteraction
	| ButtonInteraction
	| StringSelectMenuInteraction
	| UserContextMenuCommandInteraction
	| UserSelectMenuInteraction
	| MessageContextMenuCommandInteraction;

/** The longest notes the form takes. */
const maxNotesLength = 1000;

/** How long notes wait for the actor to pick a Job before they are dropped. */
const heldNotesMs = 15 * 60 * 1000;

/** Notes to fill in once the actor picks a Job: a custom ID is too short to carry them. */
const heldNotes = new Map<string, { notes: string; until: number }>();

/** The notes held for the actor while they picked a Job, if they have not expired. */
export function takeHeldNotes(userId: string): string | null {
	const held = heldNotes.get(userId);
	heldNotes.delete(userId);
	return held && held.until > Date.now() ? held.notes : null;
}

/**
 * Starts a Payment Request for `employeeUserId` (the actor themselves when null) from anywhere PayMe can be used, as a server or a
 * user app. Works out the home server it is filed in, asking the actor to pick one when several fit, then shows the form there.
 */
export async function startRequest(
	interaction: FormInteraction,
	employeeUserId: string | null,
	notes: string | null = null,
	jobId: number | null = null
) {
	const forOther = employeeUserId !== null && employeeUserId !== interaction.user.id;
	const choice = homeFor(interaction.guildId, interaction.user.id, forOther ? employeeUserId : interaction.user.id);
	const refusal = forOther ? ({ code: 'not-their-manager' } as const) : ({ code: 'not-hired' } as const);
	if (choice.kind === 'none') return runOutcome(interaction, fail(forOther ? { code: 'employee-not-found' } : refusal), null);
	if (choice.kind === 'ask') {
		holdNotes(interaction.user.id, notes);
		return askForHome(interaction, forOther ? employeeUserId : null, choice.guildIds);
	}
	return continueRequest(interaction, choice.guildId, forOther ? employeeUserId : null, notes, jobId);
}

/** Shows the form for a request filed in `home`, once that is settled. */
export async function continueRequest(
	interaction: FormInteraction,
	home: string,
	employeeUserId: string | null,
	notes: string | null,
	jobId: number | null = null
) {
	const employee = employeeUserId ? await fetchActorIn(home, employeeUserId) : null;
	const refusal = employee ? ({ code: 'not-their-manager' } as const) : ({ code: 'not-hired' } as const);
	await runAsActor(interaction, refusal, openRequestForm(interaction, home, jobId, employee, notes), home);
}

function holdNotes(userId: string, notes: string | null) {
	const prefill = notes?.trim().slice(0, maxNotesLength) || null;
	if (prefill) heldNotes.set(userId, { notes: prefill, until: Date.now() + heldNotesMs });
	else heldNotes.delete(userId);
}

async function askForHome(interaction: FormInteraction, employeeUserId: string | null, guildIds: readonly string[]) {
	const select = new StringSelectMenuBuilder()
		.setCustomId(encodeCustomId({ kind: 'home-pick', employeeUserId }))
		.setPlaceholder('Choose a server')
		.addOptions(guildIds.slice(0, 25).map((guildId) => ({ label: serverName(guildId).slice(0, 100), value: guildId })));
	await interaction.reply({
		content: 'Which server should this request go to? PayMe remembers your choice; change it later with `/home-server`.',
		components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
		flags: MessageFlags.Ephemeral
	});
}

/**
 * Shows the actor the Payment Request form for `employee` (the actor themselves when null), filed in `home`, or returns why they
 * can't have one. When the Tasks don't fit on one form, asks the actor to pick a Job first. `notes` fill in the form's notes.
 */
export function openRequestForm(
	interaction: FormInteraction,
	home: string,
	jobId: number | null,
	employee: Actor | null = null,
	notes: string | null = null
) {
	return async (actor: Actor, payMe: PayMe) => {
		const other = employee && employee.userId !== actor.userId ? employee : null;
		const form = requestForm(payMe, actor, jobId, other ?? actor);
		if (!form.ok) return form;
		const employeeUserId = other?.userId ?? null;
		const prefill = notes?.trim().slice(0, maxNotesLength) || null;
		if (form.value.kind === 'jobs') {
			holdNotes(actor.userId, prefill);
			await askForJob(interaction, home, employeeUserId, form.value.jobs);
		} else await interaction.showModal(buildRequestModal(form.value, home, employeeUserId, prefill));
		return null;
	};
}

async function askForJob(interaction: FormInteraction, home: string, employeeUserId: string | null, jobs: readonly Job[]) {
	const select = new StringSelectMenuBuilder()
		.setCustomId(encodeCustomId({ kind: 'request-job-select', home, employeeUserId }))
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

export function buildRequestModal(form: TaskForm, home: string, employeeUserId: string | null, notesValue: string | null): ModalBuilder {
	const taskSelect = new StringSelectMenuBuilder()
		.setCustomId(fieldIds.task)
		.setPlaceholder('Choose a Task')
		.setRequired(true)
		.addOptions(form.tasks.map((task) => ({ label: task.name, value: `${task.taskId}:${task.jobId}`, description: task.description })));
	const notes = new TextInputBuilder()
		.setCustomId(fieldIds.notes)
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(form.notesRequired)
		.setMaxLength(maxNotesLength);
	if (notesValue) notes.setValue(notesValue);
	const link = new TextInputBuilder().setCustomId(fieldIds.link).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500);
	const files = new FileUploadBuilder().setCustomId(fieldIds.files).setRequired(false).setMaxValues(10);

	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'request-modal', home, employeeUserId }))
		.setTitle(employeeUserId ? 'Payment Request for an Employee' : 'Payment Request')
		.addLabelComponents(
			new LabelBuilder().setLabel('Task').setStringSelectMenuComponent(taskSelect),
			new LabelBuilder().setLabel('Notes').setDescription(form.notesHint).setTextInputComponent(notes),
			new LabelBuilder().setLabel('Link').setDescription(form.linkHint).setTextInputComponent(link),
			new LabelBuilder().setLabel('Files').setDescription(form.filesHint).setFileUploadComponent(files)
		);
}
