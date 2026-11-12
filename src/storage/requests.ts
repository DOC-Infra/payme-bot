import { and, asc, eq, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import type { RequestState } from '../core/labels';
import type { Evidence, EvidenceItem, PaymentRequest, RequestHistoryEntry, RequestMessage } from '../core/requests';
import { paymentRequestEvidence, paymentRequestHistory, paymentRequestJobs, paymentRequestMessages, paymentRequests } from './schema';
import type { Storage } from './storage';

type RequestRow = typeof paymentRequests.$inferSelect;
type EvidenceRow = typeof paymentRequestEvidence.$inferSelect;
type HistoryRow = typeof paymentRequestHistory.$inferSelect;

export interface NewRequest {
	employeeUserId: string;
	taskId: number;
	eligibleJobIds: readonly number[];
	/** The Evidence of the first round. */
	evidence: readonly EvidenceItem[];
}

/** A change from the state the request is expected to be in, recorded in its history. */
export interface StateChange extends Omit<RequestHistoryEntry, 'from' | 'at'> {
	from: RequestState;
	/** The Evidence of a resubmission, which starts the request's next round. */
	resubmission?: readonly EvidenceItem[];
}

/** Whether the change was saved. If not, the request was no longer in the expected state: `current` is how it is now. */
export type Applied = { saved: true; request: PaymentRequest } | { saved: false; current: PaymentRequest | null };

export type RequestQuery = { numbers: readonly number[] } | { employeeUserId: string; states: readonly RequestState[] };

/** Loads and saves whole Payment Requests. Each save is atomic. */
export interface RequestStore {
	load(number: number): PaymentRequest | null;
	/** The matching requests in number order, loaded together in a fixed number of queries. */
	loadMany(query: RequestQuery): PaymentRequest[];
	create(request: NewRequest, firstEntry: { state: RequestState; actorUserId: string }): PaymentRequest;
	apply(number: number, change: StateChange): Applied;
	/** Records the message, replacing any earlier record of the same message (which moves it to the end of the request's messages). */
	recordMessage(number: number, message: RequestMessage): void;
	/** Whether the Employee already has a request for the Task, not Denied or Withdrawn, with these notes. */
	ticketClaimed(employeeUserId: string, taskId: number, notes: string): boolean;
}

export function requestStore(storage: Storage): RequestStore {
	const load = (number: number) => loadWhere(storage, eq(paymentRequests.number, number))[0] ?? null;
	return {
		load,
		loadMany: (query) => loadWhere(storage, queryFilter(query)),
		create: (request, firstEntry) => storage.transaction(() => load(insertRequest(storage, request, firstEntry))!),
		apply: (number, change) =>
			storage.transaction((): Applied => {
				if (!applyChange(storage, number, change)) return { saved: false, current: load(number) };
				return { saved: true, request: load(number)! };
			}),
		recordMessage: (number, message) => storage.transaction(() => insertMessage(storage, number, message)),
		ticketClaimed: (employeeUserId, taskId, notes) => ticketClaimed(storage, employeeUserId, taskId, notes)
	};
}

function queryFilter(query: RequestQuery): SQL | undefined {
	if ('numbers' in query) return inArray(paymentRequests.number, query.numbers);
	return and(eq(paymentRequests.employeeUserId, query.employeeUserId), inArray(paymentRequests.state, query.states));
}

function insertRequest(storage: Storage, request: NewRequest, firstEntry: { state: RequestState; actorUserId: string }): number {
	const { db } = storage;
	const { employeeUserId, taskId } = request;
	const { number } = db
		.insert(paymentRequests)
		.values({ employeeUserId, taskId, state: firstEntry.state })
		.returning({ number: paymentRequests.number })
		.get();
	if (request.eligibleJobIds.length > 0) {
		db.insert(paymentRequestJobs)
			.values(request.eligibleJobIds.map((jobId) => ({ requestNumber: number, jobId })))
			.run();
	}
	insertEvidence(storage, number, 1, request.evidence);
	insertHistory(storage, number, { from: null, to: firstEntry.state, actorUserId: firstEntry.actorUserId, reason: null });
	return number;
}

function applyChange(storage: Storage, number: number, change: StateChange): boolean {
	const { db } = storage;
	const { from, to, resubmission } = change;
	const moved = db
		.update(paymentRequests)
		.set({ state: to, ...(resubmission && { round: sql`${paymentRequests.round} + 1` }) })
		.where(and(eq(paymentRequests.number, number), eq(paymentRequests.state, from)))
		.returning({ round: paymentRequests.round })
		.get();
	if (!moved) return false;
	if (resubmission) insertEvidence(storage, number, moved.round, resubmission);
	insertHistory(storage, number, change);
	return true;
}

function insertEvidence(storage: Storage, number: number, round: number, evidence: readonly EvidenceItem[]) {
	if (evidence.length === 0) return;
	storage.db
		.insert(paymentRequestEvidence)
		.values(evidence.map((entry) => ({ requestNumber: number, round, ...evidenceColumns(entry) })))
		.run();
}

function evidenceColumns(entry: EvidenceItem) {
	const { kind } = entry;
	if (entry.kind === 'notes') return { kind, value: entry.text, name: null };
	if (entry.kind === 'link') return { kind, value: entry.url, name: null };
	return { kind, value: entry.url, name: entry.name };
}

function insertHistory(storage: Storage, number: number, entry: Omit<RequestHistoryEntry, 'at'>) {
	storage.db
		.insert(paymentRequestHistory)
		.values({ requestNumber: number, fromState: entry.from, toState: entry.to, actorUserId: entry.actorUserId, reason: entry.reason })
		.run();
}

function insertMessage(storage: Storage, number: number, message: RequestMessage) {
	const { round, jobId, channelId, messageId } = message;
	storage.db.delete(paymentRequestMessages).where(eq(paymentRequestMessages.messageId, messageId)).run();
	storage.db.insert(paymentRequestMessages).values({ requestNumber: number, round, jobId, channelId, messageId }).run();
}

function ticketClaimed(storage: Storage, employeeUserId: string, taskId: number, notes: string): boolean {
	const row = storage.db
		.select({ number: paymentRequests.number })
		.from(paymentRequests)
		.innerJoin(paymentRequestEvidence, eq(paymentRequestEvidence.requestNumber, paymentRequests.number))
		.where(
			and(
				eq(paymentRequests.employeeUserId, employeeUserId),
				eq(paymentRequests.taskId, taskId),
				notInArray(paymentRequests.state, ['denied', 'withdrawn']),
				eq(paymentRequestEvidence.kind, 'notes'),
				eq(paymentRequestEvidence.value, notes)
			)
		)
		.get();
	return row !== undefined;
}

/** Loads the matching requests whole: one query for the requests and one for each of their parts. */
function loadWhere(storage: Storage, where: SQL | undefined): PaymentRequest[] {
	const { db } = storage;
	const rows = db.select().from(paymentRequests).where(where).orderBy(asc(paymentRequests.number)).all();
	if (rows.length === 0) return [];

	const numbers = rows.map((row) => row.number);
	const jobs = db
		.select()
		.from(paymentRequestJobs)
		.where(inArray(paymentRequestJobs.requestNumber, numbers))
		.orderBy(asc(paymentRequestJobs.jobId))
		.all();
	const evidence = db
		.select()
		.from(paymentRequestEvidence)
		.where(inArray(paymentRequestEvidence.requestNumber, numbers))
		.orderBy(asc(paymentRequestEvidence.id))
		.all();
	const history = db
		.select()
		.from(paymentRequestHistory)
		.where(inArray(paymentRequestHistory.requestNumber, numbers))
		.orderBy(asc(paymentRequestHistory.id))
		.all();
	const messages = db
		.select()
		.from(paymentRequestMessages)
		.where(inArray(paymentRequestMessages.requestNumber, numbers))
		.orderBy(sql`rowid`)
		.all();

	return rows.map((row) =>
		toRequest(row, {
			eligibleJobIds: jobs.filter((job) => job.requestNumber === row.number).map((job) => job.jobId),
			evidence: evidence.filter((entry) => entry.requestNumber === row.number).map(toEvidence),
			history: history.filter((entry) => entry.requestNumber === row.number).map(toHistoryEntry),
			messages: messages
				.filter((message) => message.requestNumber === row.number)
				.map(({ round, jobId, channelId, messageId }) => ({ round, jobId, channelId, messageId }))
		})
	);
}

function toRequest(row: RequestRow, parts: Pick<PaymentRequest, 'eligibleJobIds' | 'evidence' | 'history' | 'messages'>): PaymentRequest {
	return { ...row, ...parts };
}

function toEvidence(row: EvidenceRow): Evidence {
	const { round, value } = row;
	if (row.kind === 'notes') return { round, kind: 'notes', text: value };
	if (row.kind === 'link') return { round, kind: 'link', url: value };
	return { round, kind: 'attachment', name: String(row.name), url: value };
}

function toHistoryEntry(row: HistoryRow): RequestHistoryEntry {
	return { from: row.fromState, to: row.toState, actorUserId: row.actorUserId, reason: row.reason, at: row.at };
}
