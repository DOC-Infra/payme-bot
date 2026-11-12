import { selectTaskIdByName } from '../storage/tasks';
import type { Actor } from './actor';
import { notice, type Card, type CardField, type Effect, type EvidenceFile, type MessageRef, type PostRound } from './effects';
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

export interface FormTask {
	id: number;
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

	const tasks = activeTasksForJobs(payMe, jobId === null ? offeredJobIds : [jobId]);
	if (tasks.length === 0) return fail({ code: 'no-tasks' });
	if (tasks.length > maxFormOptions) return succeed([], { kind: 'jobs', jobs: requester.offeredJobs.slice(0, maxFormOptions) });
	return succeed([], taskForm(tasks));
}

function taskForm(tasks: readonly Task[]): TaskForm {
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
		tasks: tasks.map(formTask),
		notesRequired,
		notesHint,
		linkHint: `Optional. ${evidenceRule}`,
		filesHint: `Optional screenshots. ${evidenceRule}`
	};
}

function formTask(task: Task): FormTask {
	const exemptions = [!task.evidenceRequired && 'no link or file needed', !task.notesRequired && 'no notes needed'].filter(Boolean);
	return { id: task.id, name: task.name, description: [`Rate ${formatAmount(task.rate)}`, ...exemptions].join(', ') };
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
		payMe.requests.ticketClaimed(actor.userId, task.id, notes) ? fail({ code: 'ticket-claimed', ticket }) : null
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

		const request = submit(payMe, actor, {
			employeeUserId: employee.userId,
			taskId: task.id,
			eligibleJobIds: heldJobs.filter((job) => task.jobIds.includes(job.id)).map((job) => job.id),
			evidence: evidenceItems(input)
		});
		const { number } = request;
		const forOther = onBehalf(actor, member);
		const submitted = forOther ? `Submitted by <@${actor.userId}> for <@${employee.userId}>` : `Submitted by <@${actor.userId}>`;
		const reply = `Submitted ${requestLabel(number)} for ${task.name}${forOther ? ` on behalf of <@${employee.userId}>` : ''}.`;
		return succeed([postRound(payMe, request, `${submitted}, Pending review.`), { type: 'private-reply', card: notice(reply) }], request);
	});
}

/** Posts the Evidence of the request's current round as a new Requests Thread entry and a review copy for each eligible Job. */
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
		reviewChannels: request.eligibleJobIds.map((jobId) => ({ jobId, channelId: getJob(payMe, jobId)!.reviewChannelId })),
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
	record(requestNumber: number, message: RequestMessage): void;
}

/** The messages Discord posted for a round, review copies only as far as it got. */
export interface PostedRound {
	entry: MessageRef;
	reviewCopies: { jobId: number; message: MessageRef }[];
}

export function recordRound(recorder: RoundRecorder, round: PostRound, posted: PostedRound) {
	const { requestNumber } = round;
	recorder.record(requestNumber, { round: round.round, jobId: null, ...posted.entry });
	for (const copy of posted.reviewCopies) recorder.record(requestNumber, { round: round.round, jobId: copy.jobId, ...copy.message });
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
