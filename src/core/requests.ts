import { insertMessage, insertRequest, selectRequest, ticketClaimed } from '../storage/requests';
import { selectTaskIdByName } from '../storage/tasks';
import type { Actor } from './actor';
import { notice, type Card, type CardField, type Effect, type EntryAction, type EvidenceFile } from './effects';
import { getEmployee, type Employee } from './employees';
import { getJob, jobsHeldBy, managesJob, type Job } from './jobs';
import { requestLabel, stateName, stateTone, type RequestState } from './labels';
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

/** The Tasks to offer on the request form. `employee` is who the request is for: the actor, or an Employee the actor files for. */
export function requestForm(payMe: PayMe, actor: Actor, jobId: number | null = null, employee: Actor = actor): Outcome<Task[]> {
	const requester = findRequester(payMe, actor, employee);
	if ('ok' in requester) return requester;

	const offeredJobIds = requester.offeredJobs.map((job) => job.id);
	if (jobId !== null && !offeredJobIds.includes(jobId)) return fail({ code: onBehalf(actor, employee) ? 'not-their-manager' : 'job-not-held' });

	const tasks = activeTasksForJobs(payMe, jobId === null ? offeredJobIds : [jobId]);
	if (tasks.length === 0) return fail({ code: 'no-tasks' });
	if (tasks.length > maxTasksPerJob) return fail({ code: 'pick-a-job' });
	return succeed([], tasks);
}

/** The Jobs the actor can request pay under for `employee`, to choose from when their Tasks don't fit on one form. */
export function requestJobs(payMe: PayMe, actor: Actor, employee: Actor = actor): Job[] {
	const requester = findRequester(payMe, actor, employee);
	return 'ok' in requester ? [] : requester.offeredJobs;
}

interface Requester {
	employee: Employee;
	/** Every active Job the Employee holds. */
	heldJobs: Job[];
	/** The held Jobs the actor may request pay under: all of them for the Employee, those they manage for anyone else. */
	offeredJobs: Job[];
}

function findRequester(payMe: PayMe, actor: Actor, member: Actor): Failure | Requester {
	const forOther = onBehalf(actor, member);
	const employee = getEmployee(payMe, member.userId);
	if (!employee) return fail({ code: forOther ? 'employee-not-found' : 'not-hired' });
	if (!employee.threadId) return fail({ code: forOther ? 'employee-no-requests-thread' : 'no-requests-thread' });

	const heldJobs = jobsHeldBy(payMe, member);
	const offeredJobs = forOther ? heldJobs.filter((job) => managesJob(payMe, actor, job)) : heldJobs;
	if (offeredJobs.length === 0) return fail({ code: forOther ? 'not-their-manager' : 'no-jobs' });
	return { employee, heldJobs, offeredJobs };
}

function onBehalf(actor: Actor, employee: Actor): boolean {
	return actor.userId !== employee.userId;
}

export const ticketTaskName = 'DOC Ticket Assistance';

/** Submits a Payment Request for `employee`: the actor, or an Employee holding a Job the actor manages. */
export function submitRequest(payMe: PayMe, actor: Actor, input: NewPaymentRequest, employee: Actor = actor): Outcome<PaymentRequest> {
	const invalid = checkLink(input);
	if (invalid) return invalid;

	return fileRequest(payMe, actor, employee, input, (task) => {
		if (task.notesRequired && !input.notes.trim()) return fail({ code: 'notes-required' });
		if (task.evidenceRequired && !input.link && input.files.length === 0) return fail({ code: 'evidence-required' });
		return null;
	});
}

/** Submits a Payment Request for the DOC Ticket Assistance Task. The ticket number is the Evidence, so no link or file is needed. */
export function claimTicket(payMe: PayMe, actor: Actor, ticket: string): Outcome<PaymentRequest> {
	if (!/^\d{5}$/.test(ticket)) return fail({ code: 'invalid-ticket', ticket });
	const taskId = selectTaskIdByName(payMe.storage, ticketTaskName);
	if (taskId === null) return fail({ code: 'no-ticket-task', name: ticketTaskName });

	const notes = `Ticket ${ticket}`;
	return fileRequest(payMe, actor, actor, { taskId, notes, link: null, files: [] }, (task) =>
		ticketClaimed(payMe.storage, actor.userId, task.id, notes) ? fail({ code: 'ticket-claimed', ticket }) : null
	);
}

function fileRequest(
	payMe: PayMe,
	actor: Actor,
	member: Actor,
	input: NewPaymentRequest,
	check: (task: Task) => Failure | null
): Outcome<PaymentRequest> {
	const { storage } = payMe;
	return storage.transaction(() => {
		const requester = findRequester(payMe, actor, member);
		if ('ok' in requester) return requester;

		const { employee, heldJobs, offeredJobs } = requester;
		const task = activeTasksForJobs(
			payMe,
			offeredJobs.map((job) => job.id)
		).find((offered) => offered.id === input.taskId);
		if (!task) return fail({ code: 'task-not-offered' });
		const refused = check(task);
		if (refused) return refused;

		const number = insertRequest(storage, {
			employeeUserId: employee.userId,
			submittedBy: actor.userId,
			taskId: task.id,
			eligibleJobIds: heldJobs.filter((job) => task.jobIds.includes(job.id)).map((job) => job.id),
			evidence: evidenceFor(input, 1)
		});

		const request = selectRequest(storage, number)!;
		const forOther = onBehalf(actor, member);
		const submitted = forOther ? `Submitted by <@${actor.userId}> for <@${employee.userId}>` : `Submitted by <@${actor.userId}>`;
		const reply = `Submitted ${requestLabel(number)} for ${task.name}${forOther ? ` on behalf of <@${employee.userId}>` : ''}.`;
		return succeed([...roundEffects(payMe, request, `${submitted}, Pending review.`), { type: 'private-reply', card: notice(reply) }], request);
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
			card: entryCard(request, task, heading),
			files,
			actions: entryActions(request.state)
		},
		...request.eligibleJobIds.map((jobId): Effect => ({
			type: 'post-review-message',
			requestNumber: number,
			round,
			jobId,
			channelId: getJob(payMe, jobId)!.reviewChannelId,
			card: reviewCard(request, task, employee, evidence),
			files
		}))
	];
}

function entryCard(request: PaymentRequest, task: Task, description: string): Card {
	const evidence = request.evidence.filter((entry) => entry.round === request.round);
	return {
		tone: stateTone(request.state),
		title: cardTitle(request.number, task),
		description,
		fields: evidenceFields(evidence),
		footer: roundFooter(request.round)
	};
}

/** Rewrites the request's current Requests Thread entry to show its latest state change, with the buttons that state allows. */
export function updateRequestEntry(payMe: PayMe, request: PaymentRequest): Effect {
	return {
		type: 'update-request-entry',
		requestNumber: request.number,
		round: request.round,
		card: entryCard(request, getTask(payMe, request.taskId)!, latestChange(request)),
		actions: entryActions(request.state)
	};
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
		card: {
			...reviewCard(request, task, employee, evidence),
			fields: [...evidenceFields(evidence), { name: 'Status', value: latestChange(request) }]
		}
	};
}

/** Logs the request's latest state change in the Employee's Requests Thread. */
export function logStateChange(payMe: PayMe, request: PaymentRequest, ping: boolean): Effect {
	const task = getTask(payMe, request.taskId)!;
	return {
		type: 'post-to-requests-thread',
		employeeUserId: request.employeeUserId,
		card: { tone: stateTone(request.state), title: cardTitle(request.number, task), description: latestChange(request) },
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

function cardTitle(number: number, task: Task): string {
	return `${requestLabel(number)} · ${task.name}`;
}

function roundFooter(round: number): string | undefined {
	return round > 1 ? `Resubmission ${round - 1}` : undefined;
}

function reviewCard(request: PaymentRequest, task: Task, employee: Employee, evidence: readonly Evidence[]): Card {
	return {
		tone: stateTone(request.state),
		title: cardTitle(request.number, task),
		description: `From <@${employee.userId}> (${employee.minecraftName})`,
		fields: evidenceFields(evidence),
		footer: roundFooter(request.round)
	};
}

export function checkLink(input: NewEvidence): Failure | null {
	if (input.link !== null && !/^https?:\/\/\S+$/.test(input.link)) return fail({ code: 'invalid-link', link: input.link });
	return null;
}

export function evidenceFor(input: NewEvidence, round: number): Evidence[] {
	const notes = input.notes.trim();
	const evidence: Evidence[] = notes ? [{ round, kind: 'notes', text: notes }] : [];
	if (input.link) evidence.push({ round, kind: 'link', url: input.link });
	for (const file of input.files) evidence.push({ round, kind: 'attachment', name: file.name, url: file.url });
	return evidence;
}

function evidenceFields(evidence: readonly Evidence[]): CardField[] {
	return evidence.flatMap((entry): CardField[] => {
		if (entry.kind === 'notes') return [{ name: 'Notes', value: entry.text }];
		if (entry.kind === 'link') return [{ name: 'Link', value: entry.url }];
		return [];
	});
}

function evidenceFiles(evidence: readonly Evidence[]): EvidenceFile[] {
	return evidence.flatMap((entry) => (entry.kind === 'attachment' ? [{ name: entry.name, url: entry.url }] : []));
}
