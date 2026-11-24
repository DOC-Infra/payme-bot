import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	CheckboxBuilder,
	LabelBuilder,
	ModalBuilder,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
	type MessageActionRowComponentBuilder
} from 'discord.js';
import { plainAmount, type Choice, type Job, type ManageView, type Task } from '../core';
import { encodeCustomId, type ManageButtonAction, type ManageMenuAction, type ManageModalAction } from './customIds';

export const manageFieldIds = {
	name: 'name',
	employeeRole: 'employee-role',
	managerRoles: 'manager-roles',
	rate: 'rate',
	jobs: 'jobs',
	evidence: 'evidence',
	notes: 'notes'
} as const;

/** Discord lets a role menu pick at most this many roles. */
const maxRoles = 25;

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

/** The menus and buttons a management view offers below its card. */
export function manageComponents(view: ManageView): { menus: Row[]; buttons: ButtonBuilder[] } {
	switch (view.kind) {
		case 'jobs':
			return { menus: menuRow('open-job', 'Open a Job', view.jobs), buttons: [button('new-job', null, 'New Job', ButtonStyle.Primary)] };
		case 'job':
			return {
				menus: [],
				buttons: view.actions.map((action) =>
					action === 'edit'
						? button('edit-job', view.jobId, 'Edit', ButtonStyle.Primary)
						: action === 'managers'
							? button('job-managers', view.jobId, 'Manager roles', ButtonStyle.Secondary)
							: button('retire-job', view.jobId, 'Retire', ButtonStyle.Danger)
				)
			};
		case 'tasks':
			return {
				menus: menuRow('open-job-tasks', 'Pick a Job to manage its Tasks', view.jobs),
				buttons: view.jobs.length ? [button('new-task', null, 'New Task', ButtonStyle.Primary)] : []
			};
		case 'job-tasks':
			return {
				menus: menuRow('open-task', 'Open a Task', view.tasks),
				buttons: view.canAdd ? [button('new-task', view.jobId, 'New Task', ButtonStyle.Primary)] : []
			};
		case 'task':
			return { menus: [], buttons: view.actions.map((action) => taskButton(view.taskId, action)) };
	}
}

function taskButton(taskId: number, action: 'edit' | 'jobs' | 'retire' | 'restore'): ButtonBuilder {
	if (action === 'edit') return button('edit-task', taskId, 'Edit', ButtonStyle.Primary);
	if (action === 'jobs') return button('task-jobs', taskId, 'Jobs', ButtonStyle.Secondary);
	if (action === 'retire') return button('retire-task', taskId, 'Retire', ButtonStyle.Danger);
	return button('restore-task', taskId, 'Restore', ButtonStyle.Success);
}

export function confirmRetireJobButton(job: Job): ButtonBuilder {
	return button('confirm-retire-job', job.id, truncate(`Retire ${job.name}`, 80), ButtonStyle.Danger);
}

export function buildJobModal(job: Job | null): ModalBuilder {
	const name = textInput(manageFieldIds.name, 100);
	const role = new RoleSelectMenuBuilder().setCustomId(manageFieldIds.employeeRole).setRequired(true).setMaxValues(1);
	if (job) {
		name.setValue(job.name);
		role.setDefaultRoles(job.employeeRoleId);
	}
	return new ModalBuilder()
		.setCustomId(modalId(job ? 'edit-job' : 'new-job', job?.id ?? null))
		.setTitle(job ? truncate(`Edit ${job.name}`, 45) : 'New Job')
		.addLabelComponents(
			new LabelBuilder().setLabel('Name').setTextInputComponent(name),
			new LabelBuilder().setLabel('Employee role').setDescription('Members with this role hold the Job.').setRoleSelectMenuComponent(role)
		);
}

export function buildManagerRolesModal(job: Job): ModalBuilder {
	const roles = new RoleSelectMenuBuilder().setCustomId(manageFieldIds.managerRoles).setRequired(false).setMinValues(0).setMaxValues(maxRoles);
	if (job.managerRoleIds.length) roles.setDefaultRoles(job.managerRoleIds);
	return new ModalBuilder()
		.setCustomId(modalId('job-managers', job.id))
		.setTitle(truncate(`${job.name} manager roles`, 45))
		.addLabelComponents(
			new LabelBuilder()
				.setLabel('Manager roles')
				.setDescription('Members with any of these roles manage the Job. Leave empty for none.')
				.setRoleSelectMenuComponent(roles)
		);
}

/** `jobs` are the active Jobs to choose from; `jobId` is picked to start with. */
export function buildNewTaskModal(jobs: readonly Job[], jobId: number | null): ModalBuilder {
	return new ModalBuilder()
		.setCustomId(modalId('new-task', jobId))
		.setTitle('New Task')
		.addLabelComponents(
			new LabelBuilder().setLabel('Name').setTextInputComponent(textInput(manageFieldIds.name, 100)),
			rateLabel(textInput(manageFieldIds.rate, 20)),
			jobsLabel(jobs, jobId === null ? [] : [jobId]),
			checkboxLabel(manageFieldIds.evidence, 'Needs a link or a file', true),
			checkboxLabel(manageFieldIds.notes, 'Needs notes', true)
		);
}

export function buildEditTaskModal(task: Task): ModalBuilder {
	return new ModalBuilder()
		.setCustomId(modalId('edit-task', task.id))
		.setTitle(truncate(`Edit ${task.name}`, 45))
		.addLabelComponents(
			rateLabel(textInput(manageFieldIds.rate, 20).setValue(plainAmount(task.rate))),
			checkboxLabel(manageFieldIds.evidence, 'Needs a link or a file', task.evidenceRequired),
			checkboxLabel(manageFieldIds.notes, 'Needs notes', task.notesRequired)
		);
}

/** `jobs` are the active Jobs to choose from. */
export function buildTaskJobsModal(task: Task, jobs: readonly Job[]): ModalBuilder {
	return new ModalBuilder()
		.setCustomId(modalId('task-jobs', task.id))
		.setTitle(truncate(`${task.name} Jobs`, 45))
		.addLabelComponents(jobsLabel(jobs, task.jobIds));
}

function rateLabel(input: TextInputBuilder): LabelBuilder {
	return new LabelBuilder().setLabel('Rate').setDescription('Like 1500 or 12.5.').setTextInputComponent(input);
}

function jobsLabel(jobs: readonly Job[], picked: readonly number[]): LabelBuilder {
	const select = new StringSelectMenuBuilder()
		.setCustomId(manageFieldIds.jobs)
		.setRequired(true)
		.setMinValues(1)
		.setMaxValues(jobs.length)
		.addOptions(jobs.map((job) => ({ label: truncate(job.name, 100), value: String(job.id), default: picked.includes(job.id) })));
	return new LabelBuilder().setLabel('Jobs').setDescription('The Jobs whose Employees can request this Task.').setStringSelectMenuComponent(select);
}

function checkboxLabel(customId: string, label: string, checked: boolean): LabelBuilder {
	return new LabelBuilder().setLabel(label).setCheckboxComponent(new CheckboxBuilder().setCustomId(customId).setDefault(checked));
}

function menuRow(action: ManageMenuAction, placeholder: string, choices: readonly Choice[]): Row[] {
	if (choices.length === 0) return [];
	const select = new StringSelectMenuBuilder()
		.setCustomId(encodeCustomId({ kind: 'manage-menu', action }))
		.setPlaceholder(placeholder)
		.addOptions(choices.map((choice) => ({ label: truncate(choice.label, 100), value: String(choice.id) })));
	return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select)];
}

function textInput(customId: string, maxLength: number): TextInputBuilder {
	return new TextInputBuilder().setCustomId(customId).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(maxLength);
}

function button(action: ManageButtonAction, id: number | null, label: string, style: ButtonStyle): ButtonBuilder {
	return new ButtonBuilder()
		.setCustomId(encodeCustomId({ kind: 'manage-button', action, id }))
		.setLabel(label)
		.setStyle(style);
}

function modalId(action: ManageModalAction, id: number | null): string {
	return encodeCustomId({ kind: 'manage-modal', action, id });
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
