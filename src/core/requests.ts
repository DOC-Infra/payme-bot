import { insertMessage, insertRequest, selectRequest } from '../storage/requests';
import type { Actor } from './actor';
import type { Effect, EntryAction, EvidenceFile } from './effects';
import { getEmployee, type Employee } from './employees';
import { getJob, jobsHeldBy, type Job } from './jobs';
import { requestLabel, stateName, type RequestState } from './labels';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { activeTasksForJobs, getTask, maxTasksPerJob, type Task } from './tasks';

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

export interface NewEvidence {
	notes: string;
	link: string | null;
	files: readonly EvidenceFile[];
}

export interface NewPaymentRequest extends NewEvidence {
	taskId: number;
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
	const invalid = checkLink(input);
	if (invalid) return invalid;
	if (!input.link && input.files.length === 0) return fail({ code: 'evidence-required' });

	const { storage } = payMe;
	return storage.transaction(() => {
		const requester = findRequester(payMe, actor);
		if ('ok' in requester) return requester;

		const { jobs } = requester;
		const task = activeTasksForJobs(
			payMe,
			jobs.map((job) => job.id)
		).find((offered) => offered.id === input.taskId);
		if (!task) return fail({ code: 'task-not-offered' });

		const number = insertRequest(storage, {
			employeeUserId: actor.userId,
			taskId: task.id,
			eligibleJobIds: jobs.filter((job) => task.jobIds.includes(job.id)).map((job) => job.id),
			evidence: evidenceFor(input, 1)
		});

		const request = selectRequest(storage, number)!;
		return succeed(
			[
				...roundEffects(payMe, request, `Submitted by <@${actor.userId}>, Pending review.`),
				{ type: 'private-reply', content: `Submitted ${requestLabel(number)} for ${task.name}.` }
			],
			request
		);
	});
}

/** Posts the Evidence of the request's current round as a new Requests Thread entry and a review copy for each eligible Job. */
export function roundEffects(payMe: PayMe, request: PaymentRequest, heading: string): Effect[] {
	const { number, round } = request;
	const task = getTask(payMe, request.taskId)!;
	const employee = getEmployee(payMe, request.employeeUserId)!;
	const evidence = request.evidence.filter((entry) => entry.round === round);
	const files = evidenceFiles(evidence);
	return [
		{
			type: 'post-request-entry',
			requestNumber: number,
			round,
			employeeUserId: employee.userId,
			content: `${requestTitle(number, task)}\n${heading}\n${evidenceText(evidence)}`,
			files,
			actions: entryActions(request.state)
		},
		...request.eligibleJobIds.map((jobId): Effect => ({
			type: 'post-review-message',
			requestNumber: number,
			round,
			jobId,
			channelId: getJob(payMe, jobId)!.reviewChannelId,
			content: reviewCopyText(number, round, task, employee, evidence),
			files
		}))
	];
}

/** The buttons the Employee gets on the request's latest Requests Thread entry. */
export function entryActions(state: RequestState): EntryAction[] {
	if (state === 'pending') return ['withdraw'];
	if (state === 'rejected') return ['amend', 'withdraw'];
	return [];
}

/** Sets the buttons on the request's current Requests Thread entry to match its state. */
export function updateEntryActions(request: PaymentRequest): Effect {
	return { type: 'update-entry-actions', requestNumber: request.number, round: request.round, actions: entryActions(request.state) };
}

export function recordRequestMessage(payMe: PayMe, number: number, message: RequestMessage) {
	insertMessage(payMe.storage, number, message);
}

export function requestEntry(payMe: PayMe, number: number, round: number): RequestMessage | null {
	const entry = getPaymentRequest(payMe, number)?.messages.find((message) => message.round === round && message.jobId === null);
	return entry ?? null;
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
		content: `${reviewCopyText(request.number, request.round, task, employee, evidence)}\n${latestChange(request)}`
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

export function requestTitle(number: number, task: Task): string {
	return `**${requestLabel(number)}** ${task.name}`;
}

function reviewCopyText(number: number, round: number, task: Task, employee: Employee, evidence: readonly Evidence[]): string {
	const resubmitted = round > 1 ? ', resubmitted' : '';
	return `${requestTitle(number, task)} from <@${employee.userId}> (${employee.minecraftName})${resubmitted}\n${evidenceText(evidence)}`;
}

export function checkLink(input: NewEvidence): Failure | null {
	if (input.link !== null && !/^https?:\/\/\S+$/.test(input.link)) return fail({ code: 'invalid-link', link: input.link });
	return null;
}

export function evidenceFor(input: NewEvidence, round: number): Evidence[] {
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
