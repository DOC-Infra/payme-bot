import { insertMessage, insertRequest, selectRequest } from '../storage/requests';
import type { Actor } from './actor';
import type { Effect, EvidenceFile } from './effects';
import { getEmployee, type Employee } from './employees';
import { jobsHeldBy, type Job } from './jobs';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { activeTasksForJobs, getTask, maxTasksPerJob, type Task } from './tasks';

export type RequestState = 'pending' | 'approved' | 'rejected' | 'denied' | 'withdrawn' | 'paid';

export type Evidence =
	| { round: number; kind: 'notes'; text: string }
	| { round: number; kind: 'link'; url: string }
	| { round: number; kind: 'attachment'; name: string; url: string };

export interface RequestHistoryEntry {
	from: RequestState | null;
	to: RequestState;
	actorUserId: string;
	reason: string | null;
	at: string;
}

/** A message PayMe posted for a request: the Requests Thread entry when `jobId` is null, otherwise that Job's review copy. */
export interface RequestMessage {
	round: number;
	jobId: number | null;
	channelId: string;
	messageId: string;
}

export interface PaymentRequest {
	number: number;
	employeeUserId: string;
	taskId: number;
	state: RequestState;
	round: number;
	eligibleJobIds: number[];
	evidence: Evidence[];
	history: RequestHistoryEntry[];
	messages: RequestMessage[];
}

export interface NewPaymentRequest {
	taskId: number;
	notes: string;
	link: string | null;
	files: readonly EvidenceFile[];
}

export function getPaymentRequest(payMe: PayMe, number: number): PaymentRequest | null {
	return selectRequest(payMe.storage, number);
}

export function requestForm(payMe: PayMe, actor: Actor): Outcome<Task[]> {
	const requester = findRequester(payMe, actor);
	if ('ok' in requester) return requester;

	const tasks = activeTasksForJobs(
		payMe,
		requester.jobs.map((job) => job.id)
	);
	if (tasks.length === 0) return fail({ code: 'no-tasks' });
	return succeed([], tasks.slice(0, maxTasksPerJob));
}

function findRequester(payMe: PayMe, actor: Actor): Failure | { employee: Employee; jobs: Job[] } {
	const employee = getEmployee(payMe, actor.userId);
	if (!employee) return fail({ code: 'not-hired' });
	if (!employee.threadId) return fail({ code: 'no-requests-thread' });

	const jobs = jobsHeldBy(payMe, actor);
	if (jobs.length === 0) return fail({ code: 'no-jobs' });
	return { employee, jobs };
}

export function submitRequest(payMe: PayMe, actor: Actor, input: NewPaymentRequest): Outcome<PaymentRequest> {
	if (!input.notes.trim()) return fail({ code: 'notes-required' });
	if (input.link !== null && !/^https?:\/\/\S+$/.test(input.link)) return fail({ code: 'invalid-link', link: input.link });
	if (!input.link && input.files.length === 0) return fail({ code: 'evidence-required' });

	const { storage } = payMe;
	return storage.transaction(() => {
		const requester = findRequester(payMe, actor);
		if ('ok' in requester) return requester;

		const { employee, jobs } = requester;
		const task = activeTasksForJobs(
			payMe,
			jobs.map((job) => job.id)
		).find((offered) => offered.id === input.taskId);
		if (!task) return fail({ code: 'task-not-offered' });

		const eligibleJobs = jobs.filter((job) => task.jobIds.includes(job.id));
		const evidence = evidenceFor(input, 1);
		const number = insertRequest(storage, {
			employeeUserId: actor.userId,
			taskId: task.id,
			eligibleJobIds: eligibleJobs.map((job) => job.id),
			evidence
		});

		const id = requestTitle(number, task);
		const text = evidenceText(evidence);
		const files = evidenceFiles(evidence);
		const effects: Effect[] = [
			{
				type: 'post-request-entry',
				requestNumber: number,
				round: 1,
				employeeUserId: actor.userId,
				content: `${id}\nSubmitted by <@${actor.userId}>, Pending review.\n${text}`,
				files
			},
			...eligibleJobs.map((job): Effect => ({
				type: 'post-review-message',
				requestNumber: number,
				round: 1,
				jobId: job.id,
				channelId: job.reviewChannelId,
				content: reviewCopyText(number, task, employee, evidence),
				files
			})),
			{ type: 'private-reply', content: `Submitted ${requestLabel(number)} for ${task.name}.` }
		];
		return succeed(effects, selectRequest(storage, number)!);
	});
}

export function recordRequestMessage(payMe: PayMe, number: number, message: RequestMessage) {
	insertMessage(payMe.storage, number, message);
}

export function requestEntry(payMe: PayMe, number: number, round: number): RequestMessage | null {
	const entry = getPaymentRequest(payMe, number)?.messages.find((message) => message.round === round && message.jobId === null);
	return entry ?? null;
}

export function requestLabel(number: number): string {
	return `R-${number}`;
}

export function stateName(state: RequestState): string {
	return state[0].toUpperCase() + state.slice(1);
}

/** Rewrites every review copy of the request's current round to show its latest state change, without review buttons. */
export function updateReviewCopies(payMe: PayMe, request: PaymentRequest): Effect {
	const task = getTask(payMe, request.taskId)!;
	const employee = getEmployee(payMe, request.employeeUserId)!;
	const evidence = request.evidence.filter((entry) => entry.round === request.round);
	return {
		type: 'update-review-copies',
		requestNumber: request.number,
		round: request.round,
		content: `${reviewCopyText(request.number, task, employee, evidence)}\n${latestChange(request)}`
	};
}

/** Logs the request's latest state change in the Employee's Requests Thread. */
export function logStateChange(payMe: PayMe, request: PaymentRequest, ping: boolean): Effect {
	const task = getTask(payMe, request.taskId)!;
	return {
		type: 'post-to-requests-thread',
		employeeUserId: request.employeeUserId,
		content: `${requestTitle(request.number, task)}: ${latestChange(request)}`,
		ping
	};
}

function latestChange(request: PaymentRequest): string {
	const change = request.history[request.history.length - 1];
	const reason = change.reason ? `: ${change.reason}` : '';
	return `**${stateName(change.to)}** by <@${change.actorUserId}>${reason}`;
}

function requestTitle(number: number, task: Task): string {
	return `**${requestLabel(number)}** ${task.name}`;
}

function reviewCopyText(number: number, task: Task, employee: Employee, evidence: readonly Evidence[]): string {
	return `${requestTitle(number, task)} from <@${employee.userId}> (${employee.minecraftName})\n${evidenceText(evidence)}`;
}

function evidenceFor(input: NewPaymentRequest, round: number): Evidence[] {
	const evidence: Evidence[] = [{ round, kind: 'notes', text: input.notes.trim() }];
	if (input.link) evidence.push({ round, kind: 'link', url: input.link });
	for (const file of input.files) evidence.push({ round, kind: 'attachment', name: file.name, url: file.url });
	return evidence;
}

function evidenceText(evidence: readonly Evidence[]): string {
	return evidence
		.flatMap((entry) => {
			if (entry.kind === 'notes') return [`Notes: ${entry.text}`];
			if (entry.kind === 'link') return [`Link: ${entry.url}`];
			return [];
		})
		.join('\n');
}

function evidenceFiles(evidence: readonly Evidence[]): EvidenceFile[] {
	return evidence.flatMap((entry) => (entry.kind === 'attachment' ? [{ name: entry.name, url: entry.url }] : []));
}
