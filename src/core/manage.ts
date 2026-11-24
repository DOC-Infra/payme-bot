import type { Actor } from './actor';
import { notice, type Card, type Choice, type JobAction, type TaskAction } from './effects';
import { allJobs, describeJob, getJob, type Job } from './jobs';
import { fail, succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { requireLeadership } from './permissions';
import { formatAmount } from './rates';
import { allTasks, getTask, maxFormOptions, rateScheduleCard, type Task } from './tasks';

/** Every Job, with a menu to open one. */
export function jobsView(payMe: PayMe, actor: Actor): Outcome<Job[]> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const jobs = allJobs(payMe);
	const card: Card = jobs.length
		? { tone: 'info', title: 'Jobs', description: jobs.map(describeJob).join('\n\n') }
		: notice('There are no Jobs yet.', 'neutral');
	return succeed([{ type: 'show-manage', card, view: { kind: 'jobs', jobs: choices(jobs, (job) => job.name) } }], jobs);
}

export function jobView(payMe: PayMe, actor: Actor, id: number): Outcome<Job> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const job = getJob(payMe, id);
	if (!job) return fail({ code: 'job-not-found' });

	const card: Card = { tone: job.retired ? 'neutral' : 'info', title: `${job.name} Job`, description: describeJob(job) };
	const actions: JobAction[] = job.retired ? [] : ['edit', 'managers', 'retire'];
	return succeed([{ type: 'show-manage', card, view: { kind: 'job', jobId: id, actions } }], job);
}

/** The Rate Schedule, with a menu to pick the Job whose Tasks to manage. */
export function tasksView(payMe: PayMe, actor: Actor): Outcome<Task[]> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const tasks = allTasks(payMe);
	const jobs = choices(
		allJobs(payMe).filter((job) => !job.retired),
		(job) => job.name
	);
	const card = jobs.length ? rateScheduleCard(payMe, tasks) : notice('Create a Job before adding Tasks.', 'neutral');
	return succeed([{ type: 'show-manage', card, view: { kind: 'tasks', jobs } }], tasks);
}

/** A Job's Tasks, Retired ones included, with a menu to open one and a button to add one. */
export function jobTasksView(payMe: PayMe, actor: Actor, jobId: number): Outcome<Task[]> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const job = getJob(payMe, jobId);
	if (!job) return fail({ code: 'job-not-found' });

	const tasks = allTasks(payMe).filter((task) => task.jobIds.includes(jobId));
	const lines = tasks.map((task) => `**${task.name}**${task.retired ? ' (retired)' : ''}: ${formatAmount(task.rate)}`);
	const card: Card = { tone: 'info', title: `${job.name} Tasks`, description: lines.length ? lines.join('\n') : 'No Tasks yet.' };
	const view = { kind: 'job-tasks' as const, jobId, tasks: choices(tasks, taskLabel), canAdd: !job.retired };
	return succeed([{ type: 'show-manage', card, view }], tasks);
}

export function taskView(payMe: PayMe, actor: Actor, id: number): Outcome<Task> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const task = getTask(payMe, id);
	if (!task) return fail({ code: 'task-not-found' });

	const jobs = task.jobIds.map((jobId) => getJob(payMe, jobId)!).map((job) => (job.retired ? `${job.name} (retired)` : job.name));
	const card: Card = {
		tone: task.retired ? 'neutral' : 'info',
		title: `${task.name} Task${task.retired ? ' (retired)' : ''}`,
		fields: [
			{ name: 'Rate', value: formatAmount(task.rate), inline: true },
			{ name: 'Link or file', value: task.evidenceRequired ? 'Required' : 'Not needed', inline: true },
			{ name: 'Notes', value: task.notesRequired ? 'Required' : 'Not needed', inline: true },
			{ name: 'Jobs', value: jobs.sort().join(', ') }
		]
	};
	const actions: TaskAction[] = task.retired ? ['jobs', 'restore'] : ['edit', 'jobs', 'retire'];
	return succeed([{ type: 'show-manage', card, view: { kind: 'task', taskId: id, actions } }], task);
}

function taskLabel(task: Task): string {
	return task.retired ? `${task.name} (retired)` : task.name;
}

/** Up to a menu's worth of choices, active ones first. */
function choices<T extends { id: number; retired: boolean }>(items: readonly T[], label: (item: T) => string): Choice[] {
	return [...items]
		.sort((a, b) => Number(a.retired) - Number(b.retired))
		.slice(0, maxFormOptions)
		.map((item) => ({ id: item.id, label: label(item) }));
}
