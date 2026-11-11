import { notice, type Card } from './effects';
import { selectJob } from '../storage/jobs';
import type { Storage } from '../storage/storage';
import {
	countActiveTasks,
	deleteTaskJob,
	insertTask,
	insertTaskJob,
	selectTask,
	selectTaskIdByName,
	selectTasks,
	setTaskRetired,
	updateTaskEvidenceRequired,
	updateTaskNotesRequired,
	updateTaskRate
} from '../storage/tasks';
import type { Actor } from './actor';
import { allJobs } from './jobs';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { requireLeadership } from './permissions';
import { formatAmount, parseRate } from './rates';

export const maxTasksPerJob = 25;

export interface Task {
	id: number;
	name: string;
	rate: number;
	evidenceRequired: boolean;
	notesRequired: boolean;
	jobIds: number[];
	retired: boolean;
}

export interface NewTask {
	name: string;
	rate: string;
	evidenceRequired?: boolean;
	notesRequired?: boolean;
	jobIds: readonly number[];
}

export function getTask(payMe: PayMe, id: number): Task | null {
	return selectTask(payMe.storage, id);
}

export function allTasks(payMe: PayMe): Task[] {
	return selectTasks(payMe.storage);
}

export function activeTasksForJobs(payMe: PayMe, jobIds: readonly number[]): Task[] {
	return allTasks(payMe).filter((task) => !task.retired && task.jobIds.some((jobId) => jobIds.includes(jobId)));
}

export function listTasks(payMe: PayMe): Outcome<Task[]> {
	const tasks = allTasks(payMe);
	const jobNames = new Map(allJobs(payMe).map((job) => [job.id, job.name]));
	const describe = (task: Task) => {
		const jobs = task.jobIds.map((id) => jobNames.get(id)).sort();
		const notes = [
			task.retired && 'retired',
			!task.evidenceRequired && 'no link or file needed',
			!task.notesRequired && 'no notes needed'
		].filter(Boolean);
		return `**${task.name}**${notes.length ? ` (${notes.join(', ')})` : ''}: ${formatAmount(task.rate)} (${jobs.join(', ')})`;
	};
	const card: Card =
		tasks.length === 0
			? notice('The Rate Schedule is empty.', 'neutral')
			: { tone: 'info', title: 'Rate Schedule', description: tasks.map(describe).join('\n') };
	return succeed([{ type: 'private-reply', card }], tasks);
}

export function addTask(payMe: PayMe, actor: Actor, input: NewTask): Outcome<Task> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const rate = parseRate(input.rate);
	if (rate === null) return fail({ code: 'invalid-rate', rate: input.rate });
	if (input.jobIds.length === 0) return fail({ code: 'task-needs-a-job' });

	const { storage } = payMe;
	return storage.transaction(() => {
		const existingId = selectTaskIdByName(storage, input.name);
		if (existingId !== null) return fail({ code: 'task-name-taken', name: input.name, retired: selectTask(storage, existingId)!.retired });
		for (const jobId of input.jobIds) {
			const unusable = checkJob(storage, jobId, true);
			if (typeof unusable !== 'string') return unusable;
		}

		const task = selectTask(
			storage,
			insertTask(
				storage,
				input.name,
				rate,
				{ evidenceRequired: input.evidenceRequired ?? true, notesRequired: input.notesRequired ?? true },
				input.jobIds
			)
		)!;
		return succeed([{ type: 'private-reply', card: notice(`Added the ${task.name} Task.`) }], task);
	});
}

export function changeRate(payMe: PayMe, actor: Actor, id: number, text: string): Outcome<Task> {
	const rate = parseRate(text);
	return changeTask(payMe, actor, id, (task) => {
		if (rate === null) return fail({ code: 'invalid-rate', rate: text });
		updateTaskRate(payMe.storage, id, rate);
		return `The ${task.name} Task now pays ${formatAmount(rate)}.`;
	});
}

export function setEvidenceRequired(payMe: PayMe, actor: Actor, id: number, required: boolean): Outcome<Task> {
	return changeTask(payMe, actor, id, (task) => {
		updateTaskEvidenceRequired(payMe.storage, id, required);
		return required ? `The ${task.name} Task now needs a link or a file as Evidence.` : `The ${task.name} Task no longer needs a link or a file.`;
	});
}

export function setNotesRequired(payMe: PayMe, actor: Actor, id: number, required: boolean): Outcome<Task> {
	return changeTask(payMe, actor, id, (task) => {
		updateTaskNotesRequired(payMe.storage, id, required);
		return required ? `The ${task.name} Task now needs notes.` : `The ${task.name} Task no longer needs notes.`;
	});
}

export function addTaskToJob(payMe: PayMe, actor: Actor, id: number, jobId: number): Outcome<Task> {
	return changeTask(payMe, actor, id, (task) => {
		const jobName = checkJob(payMe.storage, jobId, !task.retired && !task.jobIds.includes(jobId));
		if (typeof jobName !== 'string') return jobName;
		insertTaskJob(payMe.storage, id, jobId);
		return `The ${task.name} Task now belongs to the ${jobName} Job.`;
	});
}

export function removeTaskFromJob(payMe: PayMe, actor: Actor, id: number, jobId: number): Outcome<Task> {
	return changeTask(payMe, actor, id, (task) => {
		const job = selectJob(payMe.storage, jobId);
		if (!job) return fail({ code: 'job-not-found' });
		if (task.jobIds.every((taskJobId) => taskJobId === jobId)) return fail({ code: 'task-needs-a-job' });
		deleteTaskJob(payMe.storage, id, jobId);
		return `The ${task.name} Task no longer belongs to the ${job.name} Job.`;
	});
}

export function retireTask(payMe: PayMe, actor: Actor, id: number): Outcome<Task> {
	return changeTask(payMe, actor, id, (task) => {
		setTaskRetired(payMe.storage, id, true);
		return `Retired the ${task.name} Task.`;
	});
}

/** Makes a Retired Task requestable again, with the Rate, Jobs and requirements it had. */
export function restoreTask(payMe: PayMe, actor: Actor, id: number): Outcome<Task> {
	return changeTask(payMe, actor, id, (task) => {
		if (!task.retired) return fail({ code: 'task-not-retired', name: task.name });
		const activeJobIds = task.jobIds.filter((jobId) => selectJob(payMe.storage, jobId)?.retired === false);
		if (activeJobIds.length === 0) return fail({ code: 'task-has-no-active-job', name: task.name });
		for (const jobId of activeJobIds) {
			const unusable = checkJob(payMe.storage, jobId, true);
			if (typeof unusable !== 'string') return unusable;
		}
		setTaskRetired(payMe.storage, id, false);
		return `Restored the ${task.name} Task.`;
	});
}

function changeTask(payMe: PayMe, actor: Actor, id: number, change: (task: Task) => Failure | string): Outcome<Task> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		const task = selectTask(storage, id);
		if (!task) return fail({ code: 'task-not-found' });

		const result = change(task);
		if (typeof result !== 'string') return result;
		return succeed([{ type: 'private-reply', card: notice(result) }], selectTask(storage, id)!);
	});
}

function checkJob(storage: Storage, jobId: number, addsActiveTask: boolean): Failure | string {
	const job = selectJob(storage, jobId);
	if (!job) return fail({ code: 'job-not-found' });
	if (job.retired) return fail({ code: 'job-retired', name: job.name });
	if (addsActiveTask && countActiveTasks(storage, jobId) >= maxTasksPerJob) return fail({ code: 'too-many-tasks', job: job.name });
	return job.name;
}
