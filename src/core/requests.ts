import { selectTaskIdByName } from '../storage/tasks';
import type { Actor } from './actor';
import { type Card, type CardField, type Effect, type EvidenceFile, type MessageRef, type PostRound } from './effects';
import { getEmployee, type Employee } from './employees';
import { jobsHeldBy, managesJob } from './job-membership';
import { getJob, type Job } from './jobs';
import { entryActions, submit } from './lifecycle';
import { requestLabel, stateName, stateTone, type RequestState } from './labels';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import { formatAmount } from './rates';
import type { PayMe } from './payme';
import { activeTasksForJobs, getTask, maxFormOptions, type Task } from './tasks';

export type EvidenceItem = { kind: 'notes'; text: string } | { kind: 'link'; url: string } | { kind: 'attachment'; name: string; url: string };

/** Evidence given in a submission round. */
export type Evidence = EvidenceItem & { round: number };

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
	/** The DOC ticket number, for a ticket claim. */
	ticket: string | null;
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
	/** The Job the work was for. Required when the Task is in more than one of the Jobs it could be requested under. */
	jobId?: number;
}

/** What the request form shows: its Tasks when they fit on one form, otherwise the Jobs to pick from first. */
export type RequestForm = TaskForm | { kind: 'jobs'; jobs: Job[] };

export interface TaskForm {
	kind: 'tasks';
	tasks: FormTask[];
	notesRequired: boolean;
	notesHint: string;
	linkHint: string;
	filesHint: string;
}

/** One choice on the form: a Task under one Job. A Task in several of the offered Jobs is one choice per Job. */
export interface FormTask {
	taskId: number;
	jobId: number;
	/** The Task's name, followed by its Job's when it is offered under more than one. */
	name: string;
	/** The Task's Rate and any Evidence or notes it doesn't need. */
	description: string;
}

/** The request form for `employee`: the actor, or an Employee the actor files for. */
export function requestForm(payMe: PayMe, actor: Actor, jobId: number | null = null, employee: Actor = actor): Outcome<RequestForm> {
	const requester = findRequester(payMe, actor, employee);
	if ('ok' in requester) return requester;

	const offeredJobIds = requester.offeredJobs.map((job) => job.id);
	if (jobId !== null && !offeredJobIds.includes(jobId)) return fail({ code: onBehalf(actor, employee) ? 'not-their-manager' : 'job-not-held' });

	const jobs = jobId === null ? requester.offeredJobs : requester.offeredJobs.filter((job) => job.id === jobId);
	const tasks = activeTasksForJobs(
		payMe,
		jobs.map((job) => job.id)
	);
	if (tasks.length === 0) return fail({ code: 'no-tasks' });
	const choices = tasks.flatMap((task) => formTasks(task, jobs));
	if (choices.length > maxFormOptions) return succeed([], { kind: 'jobs', jobs: requester.offeredJobs.slice(0, maxFormOptions) });
	return succeed([], taskForm(tasks, choices));
}

function taskForm(tasks: readonly Task[], choices: FormTask[]): TaskForm {
	const notesRequired = tasks.every((task) => task.notesRequired);
	const someNeedNotes = tasks.some((task) => task.notesRequired);
	const notesHint = notesRequired
		? 'What did you do?'
		: `What did you do? ${someNeedNotes ? 'Required unless the Task says otherwise.' : 'Optional.'}`;
	const evidenceRule = tasks.every((task) => task.evidenceRequired)
		? 'A link or a file is required.'
		: 'A link or a file is required unless the Task says otherwise.';
	return {
		kind: 'tasks',
		tasks: choices,
		notesRequired,
		notesHint,
		linkHint: `Optional. ${evidenceRule}`,
		filesHint: `Optional screenshots. ${evidenceRule}`
	};
}

function formTasks(task: Task, jobs: readonly Job[]): FormTask[] {
	const exemptions = [!task.evidenceRequired && 'no link or file needed', !task.notesRequired && 'no notes needed'].filter(Boolean);
	const description = [`Rate ${formatAmount(task.rate)}`, ...exemptions].join(', ');
	const taskJobs = jobs.filter((job) => task.jobIds.includes(job.id));
	const shared = taskJobs.length > 1;
	return taskJobs.map((job) => ({ taskId: task.id, jobId: job.id, name: shared ? `${task.name} (${job.name})` : task.name, description }));
}

interface Requester {
	employee: Employee;
	/** The active Jobs the Employee holds the actor may request pay under: all of them for the Employee, those they manage for anyone else. */
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
	return { employee, offeredJobs };
}

function onBehalf(actor: Actor, employee: Actor): boolean {
	return actor.userId !== employee.userId;
}

export const ticketTaskName = 'DOC Ticket Assistance';

/** Submits a Payment Request for `employee`: the actor, or an Employee holding a Job the actor manages, which is Approved at once. */
export function submitRequest(payMe: PayMe, actor: Actor, input: NewPaymentRequest, employee: Actor = actor): Outcome<PaymentRequest> {
	const invalid = checkLink(input);
	if (invalid) return invalid;

	return fileRequest(payMe, actor, employee, input, (task) => {
		if (task.notesRequired && !input.notes.trim()) return fail({ code: 'notes-required' });
		if (task.evidenceRequired && !input.link && input.files.length === 0) return fail({ code: 'evidence-required' });
		return null;
	});
}

/** The DOC Ticket number a message mentions: the first run of exactly five digits, or null. */
export function ticketNumberIn(text: string): string | null {
	return /(?<!\d)\d{5}(?!\d)/.exec(text)?.[0] ?? null;
}

/** The Jobs the actor can claim a ticket under: those they hold that have the DOC Ticket Assistance Task. */
export function ticketJobs(payMe: PayMe, actor: Actor): Job[] {
	const taskId = selectTaskIdByName(payMe.storage, ticketTaskName);
	const task = taskId === null ? null : getTask(payMe, taskId);
	if (!task || task.retired) return [];
	return jobsHeldBy(payMe, actor)
		.filter((job) => task.jobIds.includes(job.id))
		.slice(0, maxFormOptions);
}

/** Submits a Payment Request for the DOC Ticket Assistance Task. The ticket number is the Evidence, so no link or file is needed. */
export function claimTicket(payMe: PayMe, actor: Actor, ticket: string, jobId?: number): Outcome<PaymentRequest> {
	if (!/^\d{5}$/.test(ticket)) return fail({ code: 'invalid-ticket', ticket });
	const taskId = selectTaskIdByName(payMe.storage, ticketTaskName);
	if (taskId === null) return fail({ code: 'no-ticket-task', name: ticketTaskName });

	const input = { taskId, jobId, notes: `Ticket ${ticket}`, link: null, files: [], ticket };
	return fileRequest(payMe, actor, actor, input, () =>
		payMe.requests.ticketClaimed(actor.userId, ticket) ? fail({ code: 'ticket-claimed', ticket }) : null
	);
}

function fileRequest(
	payMe: PayMe,
	actor: Actor,
	member: Actor,
	input: NewPaymentRequest & { ticket?: string },
	check: (task: Task) => Failure | null
): Outcome<PaymentRequest> {
	const { storage } = payMe;
	return storage.transaction(() => {
		const requester = findRequester(payMe, actor, member);
		if ('ok' in requester) return requester;

		const { employee, offeredJobs } = requester;
		const task = activeTasksForJobs(
			payMe,
			offeredJobs.map((job) => job.id)
		).find((offered) => offered.id === input.taskId);
		if (!task) return fail({ code: 'task-not-offered' });
		const job = pickJob(offeredJobs, task, input.jobId);
		if ('ok' in job) return job;
		const refused = check(task);
		if (refused) return refused;

		const request = submit(payMe, actor, {
			employeeUserId: employee.userId,
			taskId: task.id,
			eligibleJobIds: [job.id],
			evidence: evidenceItems(input),
			ticket: input.ticket
		});
		const forOther = onBehalf(actor, member);
		const heading = forOther
			? `Submitted by <@${actor.userId}> for <@${employee.userId}>, Approved.`
			: `Submitted by <@${actor.userId}>, Pending review.`;
		return succeed([postRound(payMe, request, heading)], request);
	});
}

/** The one Job the request is for: the one given, or the only offered Job the Task is in. */
function pickJob(offeredJobs: readonly Job[], task: Task, jobId: number | undefined): Job | Failure {
	const taskJobs = offeredJobs.filter((job) => task.jobIds.includes(job.id));
	if (jobId !== undefined) return taskJobs.find((job) => job.id === jobId) ?? fail({ code: 'task-not-offered' });
	if (taskJobs.length > 1) return fail({ code: 'job-required', task: task.name });
	return taskJobs[0];
}

/**
 * Posts the Evidence of the request's current round as a new Requests Thread entry and, while it is Pending, a review copy for each
 * eligible Job.
 */
export function postRound(payMe: PayMe, request: PaymentRequest, heading: string): PostRound {
	const task = getTask(payMe, request.taskId)!;
	const employee = getEmployee(payMe, request.employeeUserId)!;
	const evidence = request.evidence.filter((entry) => entry.round === request.round);
	return {
		type: 'post-round',
		requestNumber: request.number,
		round: request.round,
		employeeUserId: employee.userId,
		entryCard: entryCard(request, task, heading),
		actions: entryActions(request),
		reviewCard: reviewCard(request, task, employee, evidence),
		reviewChannels:
			request.state === 'pending' ? request.eligibleJobIds.map((jobId) => ({ jobId, channelId: getJob(payMe, jobId)!.reviewChannelId })) : [],
		files: evidenceFiles(evidence)
	};
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
		actions: entryActions(request)
	};
}

/** Sets the buttons on the request's Requests Thread entry for `round` to match its state. */
export function updateEntryActions(request: PaymentRequest, round = request.round): Effect {
	return { type: 'update-entry-actions', requestNumber: request.number, round, actions: entryActions(request, round) };
}

/** Where the messages a round posted get recorded: the request's storage in production, a list in tests. */
export interface RoundRecorder {
	recordMessage(requestNumber: number, message: RequestMessage): void;
}

/** Posts a round's messages in Discord: in production the bot, in tests a fake. */
export interface RoundPoster {
	postEntry(round: PostRound): Promise<MessageRef>;
	postReviewCopy(round: PostRound, channelId: string, entry: MessageRef): Promise<MessageRef>;
}

/**
 * Posts the round's Requests Thread entry, then a review copy linking to it in each Review Channel, recording each message as soon
 * as it is posted so a decision made from an early review copy already sees it. Stops at the first message that fails to post.
 */
export async function carryOutRound(round: PostRound, poster: RoundPoster, recorder: RoundRecorder): Promise<void> {
	const { requestNumber } = round;
	const entry = await poster.postEntry(round);
	recorder.recordMessage(requestNumber, { round: round.round, jobId: null, ...entry });
	for (const review of round.reviewChannels) {
		const copy = await poster.postReviewCopy(round, review.channelId, entry);
		recorder.recordMessage(requestNumber, { round: round.round, jobId: review.jobId, ...copy });
	}
}

export function requestEntry(payMe: PayMe, number: number, round: number): RequestMessage | null {
	const entry = payMe.requests.load(number)?.messages.find((message) => message.round === round && message.jobId === null);
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
		messages: reviewCopies(request, request.round),
		card: {
			...reviewCard(request, task, employee, evidence),
			fields: [...evidenceFields(evidence), { name: 'Status', value: latestChange(request) }]
		}
	};
}

/** Deletes the review copies of every round of the request. */
export function deleteReviewCopies(request: PaymentRequest): Effect {
	return { type: 'delete-review-copies', requestNumber: request.number, messages: reviewCopies(request) };
}

/** The request's review copies from `round`, or from every round. */
function reviewCopies(request: PaymentRequest, round?: number): MessageRef[] {
	return request.messages
		.filter((message) => message.jobId !== null && (round === undefined || message.round === round))
		.map(({ channelId, messageId }) => ({ channelId, messageId }));
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

export function evidenceItems(input: NewEvidence): EvidenceItem[] {
	const notes = input.notes.trim();
	const evidence: EvidenceItem[] = notes ? [{ kind: 'notes', text: notes }] : [];
	if (input.link) evidence.push({ kind: 'link', url: input.link });
	for (const file of input.files) evidence.push({ kind: 'attachment', name: file.name, url: file.url });
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
