import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { RequestState } from '../core/labels';
import type { Evidence, PaymentRequest, RequestHistoryEntry, RequestMessage } from '../core/requests';
import { paymentRequestEvidence, paymentRequestHistory, paymentRequestJobs, paymentRequestMessages, paymentRequests } from './schema';
import type { Storage } from './storage';

type EvidenceRow = typeof paymentRequestEvidence.$inferSelect;
type HistoryRow = typeof paymentRequestHistory.$inferSelect;

export interface NewRequestRow {
	employeeUserId: string;
	taskId: number;
	eligibleJobIds: readonly number[];
	evidence: readonly Evidence[];
}

export function insertRequest(storage: Storage, request: NewRequestRow): number {
	const { db } = storage;
	const { employeeUserId, taskId } = request;
	const { number } = db
		.insert(paymentRequests)
		.values({ employeeUserId, taskId, state: 'pending' })
		.returning({ number: paymentRequests.number })
		.get();
	if (request.eligibleJobIds.length > 0) {
		db.insert(paymentRequestJobs)
			.values(request.eligibleJobIds.map((jobId) => ({ requestNumber: number, jobId })))
			.run();
	}
	insertEvidence(storage, number, request.evidence);
	insertHistory(storage, number, { from: null, to: 'pending', actorUserId: employeeUserId, reason: null });
	return number;
}

export function insertEvidence(storage: Storage, number: number, evidence: readonly Evidence[]) {
	if (evidence.length === 0) return;
	storage.db
		.insert(paymentRequestEvidence)
		.values(evidence.map((entry) => ({ requestNumber: number, ...evidenceColumns(entry) })))
		.run();
}

function evidenceColumns(entry: Evidence) {
	const { round, kind } = entry;
	if (entry.kind === 'notes') return { round, kind, value: entry.text, name: null };
	if (entry.kind === 'link') return { round, kind, value: entry.url, name: null };
	return { round, kind, value: entry.url, name: entry.name };
}

export function insertHistory(storage: Storage, number: number, entry: Omit<RequestHistoryEntry, 'at'>) {
	storage.db
		.insert(paymentRequestHistory)
		.values({ requestNumber: number, fromState: entry.from, toState: entry.to, actorUserId: entry.actorUserId, reason: entry.reason })
		.run();
}

/** Moves the request to `to` only if it is still in `from`, and records it in the history. False if its state had already changed. */
export function updateRequestState(storage: Storage, number: number, change: Omit<RequestHistoryEntry, 'at'> & { from: RequestState }): boolean {
	const { changes } = storage.db
		.update(paymentRequests)
		.set({ state: change.to })
		.where(and(eq(paymentRequests.number, number), eq(paymentRequests.state, change.from)))
		.run();
	if (changes === 0) return false;
	insertHistory(storage, number, change);
	return true;
}

export function startNextRound(storage: Storage, number: number) {
	storage.db
		.update(paymentRequests)
		.set({ round: sql`${paymentRequests.round} + 1` })
		.where(eq(paymentRequests.number, number))
		.run();
}

export function selectRequestNumbers(storage: Storage, employeeUserId: string, states: readonly RequestState[]): number[] {
	return storage.db
		.select({ number: paymentRequests.number })
		.from(paymentRequests)
		.where(and(eq(paymentRequests.employeeUserId, employeeUserId), inArray(paymentRequests.state, states)))
		.orderBy(asc(paymentRequests.number))
		.all()
		.map((row) => row.number);
}

/** Whether the Employee already has a request for the Task, not Denied or Withdrawn, with these notes. */
export function ticketClaimed(storage: Storage, employeeUserId: string, taskId: number, notes: string): boolean {
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

/** Records the message, replacing any earlier record of the same message (which moves it to the end of the request's messages). */
export function insertMessage(storage: Storage, number: number, message: RequestMessage) {
	const { round, jobId, channelId, messageId } = message;
	storage.db.transaction((tx) => {
		tx.delete(paymentRequestMessages).where(eq(paymentRequestMessages.messageId, messageId)).run();
		tx.insert(paymentRequestMessages).values({ requestNumber: number, round, jobId, channelId, messageId }).run();
	});
}

export function selectRequest(storage: Storage, number: number): PaymentRequest | null {
	const { db } = storage;
	const row = db.select().from(paymentRequests).where(eq(paymentRequests.number, number)).get();
	if (!row) return null;

	return {
		...row,
		eligibleJobIds: db
			.select({ jobId: paymentRequestJobs.jobId })
			.from(paymentRequestJobs)
			.where(eq(paymentRequestJobs.requestNumber, number))
			.orderBy(asc(paymentRequestJobs.jobId))
			.all()
			.map((job) => job.jobId),
		evidence: db
			.select()
			.from(paymentRequestEvidence)
			.where(eq(paymentRequestEvidence.requestNumber, number))
			.orderBy(asc(paymentRequestEvidence.id))
			.all()
			.map(toEvidence),
		history: db
			.select()
			.from(paymentRequestHistory)
			.where(eq(paymentRequestHistory.requestNumber, number))
			.orderBy(asc(paymentRequestHistory.id))
			.all()
			.map(toHistoryEntry),
		messages: db
			.select({
				round: paymentRequestMessages.round,
				jobId: paymentRequestMessages.jobId,
				channelId: paymentRequestMessages.channelId,
				messageId: paymentRequestMessages.messageId
			})
			.from(paymentRequestMessages)
			.where(eq(paymentRequestMessages.requestNumber, number))
			.orderBy(sql`rowid`)
			.all()
	};
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
