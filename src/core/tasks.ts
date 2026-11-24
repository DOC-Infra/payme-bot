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

/** The most options a request form or Job picker can list, so also the most active Tasks a Job can have. */
export const maxFormOptions = 25;

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

/** Every Task with its Rate, Jobs and requirements. */
export function rateScheduleCard(payMe: PayMe, tasks: readonly Task[] = allTasks(payMe)): Card {
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
	return tasks.length === 0
		? notice('The Rate Schedule is empty.', 'neutral')
		: { tone: 'info', title: 'Rate Schedule', description: tasks.map(describe).join('\n') };
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

/** What to change on a Task. Anything left out stays as it is. */
export interface TaskChanges {
	rate?: string;
	evidenceRequired?: boolean;
	notesRequired?: boolean;
}

/** Changes a Task's Rate and what its requests need in one go, leaving what is unchanged alone. */
export function editTask(payMe: PayMe, actor: Actor, id: number, changes: TaskChanges): Outcome<Task> {
	const rate = changes.rate === undefined ? undefined : parseRate(changes.rate);
	return changeTask(payMe, actor, id, (task) => {
		if (rate === null) return fail({ code: 'invalid-rate', rate: changes.rate! });
		const { storage } = payMe;
		const changed: string[] = [];
		if (rate !== undefined && rate !== task.rate) {
			updateTaskRate(storage, id, rate);
			changed.push(`now pays ${formatAmount(rate)}`);
		}
		if (changes.evidenceRequired !== undefined && changes.evidenceRequired !== task.evidenceRequired) {
			updateTaskEvidenceRequired(storage, id, changes.evidenceRequired);
			changed.push(changes.evidenceRequired ? 'now needs a link or a file' : 'no longer needs a link or a file');
		}
		if (changes.notesRequired !== undefined && changes.notesRequired !== task.notesRequired) {
			updateTaskNotesRequired(storage, id, changes.notesRequired);
			changed.push(changes.notesRequired ? 'now needs notes' : 'no longer needs notes');
		}
		return changed.length ? `The ${task.name} Task ${joinList(changed)}.` : `Nothing changed on the ${task.name} Task.`;
	});
}

/**
 * Makes the Task belong to exactly these active Jobs, keeping any Retired Jobs it belongs to so its past requests still name them.
 */
export function setTaskJobs(payMe: PayMe, actor: Actor, id: number, activeJobIds: readonly number[]): Outcome<Task> {
	return changeTask(payMe, actor, id, (task) => {
		const { storage } = payMe;
		const retiredJobIds = task.jobIds.filter((jobId) => selectJob(storage, jobId)?.retired !== false);
		const wanted = [...new Set([...activeJobIds, ...retiredJobIds])];
		if (activeJobIds.length === 0) return fail({ code: 'task-needs-a-job' });

		const added = wanted.filter((jobId) => !task.jobIds.includes(jobId));
		const removed = task.jobIds.filter((jobId) => !wanted.includes(jobId));
		for (const jobId of added) {
			const unusable = checkJob(storage, jobId, !task.retired);
			if (typeof unusable !== 'string') return unusable;
		}
		for (const jobId of removed) deleteTaskJob(storage, id, jobId);
		for (const jobId of added) insertTaskJob(storage, id, jobId);

		const names = activeJobIds.map((jobId) => selectJob(storage, jobId)!.name).sort();
		const verb = added.length || removed.length ? 'now belongs to' : 'still belongs to';
		return `The ${task.name} Task ${verb} ${joinList(names)}.`;
	});
}

function joinList(items: readonly string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
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
	if (addsActiveTask && countActiveTasks(storage, jobId) >= maxFormOptions) return fail({ code: 'too-many-tasks', job: job.name });
	return job.name;
}
