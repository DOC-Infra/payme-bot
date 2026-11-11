import type { Evidence, PaymentRequest, RequestHistoryEntry, RequestMessage, RequestState } from '../core/requests';
import type { Storage } from './storage';

type Row = Record<string, unknown>;

export interface NewRequestRow {
	employeeUserId: string;
	taskId: number;
	eligibleJobIds: readonly number[];
	evidence: readonly Evidence[];
}

export function insertRequest(storage: Storage, request: NewRequestRow): number {
	const { db } = storage;
	const result = db
		.prepare("INSERT INTO payment_requests (employee_user_id, task_id, state) VALUES (?, ?, 'pending')")
		.run(request.employeeUserId, request.taskId);
	const number = Number(result.lastInsertRowid);
	const addJob = db.prepare('INSERT INTO payment_request_jobs (request_number, job_id) VALUES (?, ?)');
	for (const jobId of request.eligibleJobIds) addJob.run(number, jobId);
	insertEvidence(storage, number, request.evidence);
	insertHistory(storage, number, { from: null, to: 'pending', actorUserId: request.employeeUserId, reason: null });
	return number;
}

export function insertEvidence(storage: Storage, number: number, evidence: readonly Evidence[]) {
	const add = storage.db.prepare('INSERT INTO payment_request_evidence (request_number, round, kind, value, name) VALUES (?, ?, ?, ?, ?)');
	for (const entry of evidence) {
		if (entry.kind === 'notes') add.run(number, entry.round, entry.kind, entry.text, null);
		else if (entry.kind === 'link') add.run(number, entry.round, entry.kind, entry.url, null);
		else add.run(number, entry.round, entry.kind, entry.url, entry.name);
	}
}

export function insertHistory(storage: Storage, number: number, entry: Omit<RequestHistoryEntry, 'at'>) {
	storage.db
		.prepare('INSERT INTO payment_request_history (request_number, from_state, to_state, actor_user_id, reason) VALUES (?, ?, ?, ?, ?)')
		.run(number, entry.from, entry.to, entry.actorUserId, entry.reason);
}

/** Moves the request to `to` only if it is still in `from`, and records it in the history. False if its state had already changed. */
export function updateRequestState(storage: Storage, number: number, change: Omit<RequestHistoryEntry, 'at'> & { from: RequestState }): boolean {
	const { changes } = storage.db
		.prepare('UPDATE payment_requests SET state = ? WHERE number = ? AND state = ?')
		.run(change.to, number, change.from);
	if (Number(changes) === 0) return false;
	insertHistory(storage, number, change);
	return true;
}

export function startNextRound(storage: Storage, number: number) {
	storage.db.prepare('UPDATE payment_requests SET round = round + 1 WHERE number = ?').run(number);
}

export function selectRequestNumbers(storage: Storage, employeeUserId: string, states: readonly RequestState[]): number[] {
	return storage.db
		.prepare(`SELECT number FROM payment_requests WHERE employee_user_id = ? AND state IN (${states.map(() => '?').join(', ')}) ORDER BY number`)
		.all(employeeUserId, ...states)
		.map((row) => Number(row.number));
}

export function insertMessage(storage: Storage, number: number, message: RequestMessage) {
	storage.db
		.prepare('INSERT OR REPLACE INTO payment_request_messages (message_id, request_number, round, job_id, channel_id) VALUES (?, ?, ?, ?, ?)')
		.run(message.messageId, number, message.round, message.jobId, message.channelId);
}

export function selectRequest(storage: Storage, number: number): PaymentRequest | null {
	const { db } = storage;
	const row = db.prepare('SELECT * FROM payment_requests WHERE number = ?').get(number);
	if (!row) return null;

	const byRequest = (sql: string) => db.prepare(sql).all(number);
	return {
		number,
		employeeUserId: String(row.employee_user_id),
		taskId: Number(row.task_id),
		state: row.state as RequestState,
		round: Number(row.round),
		eligibleJobIds: byRequest('SELECT job_id FROM payment_request_jobs WHERE request_number = ? ORDER BY job_id').map((job) =>
			Number(job.job_id)
		),
		evidence: byRequest('SELECT * FROM payment_request_evidence WHERE request_number = ? ORDER BY id').map(toEvidence),
		history: byRequest('SELECT * FROM payment_request_history WHERE request_number = ? ORDER BY id').map(toHistoryEntry),
		messages: byRequest('SELECT * FROM payment_request_messages WHERE request_number = ? ORDER BY rowid').map(toMessage)
	};
}

function toEvidence(row: Row): Evidence {
	const round = Number(row.round);
	const value = String(row.value);
	if (row.kind === 'notes') return { round, kind: 'notes', text: value };
	if (row.kind === 'link') return { round, kind: 'link', url: value };
	return { round, kind: 'attachment', name: String(row.name), url: value };
}

function toHistoryEntry(row: Row): RequestHistoryEntry {
	return {
		from: row.from_state === null ? null : (row.from_state as RequestState),
		to: row.to_state as RequestState,
		actorUserId: String(row.actor_user_id),
		reason: row.reason === null ? null : String(row.reason),
		at: String(row.at)
	};
}

function toMessage(row: Row): RequestMessage {
	return {
		round: Number(row.round),
		jobId: row.job_id === null ? null : Number(row.job_id),
		channelId: String(row.channel_id),
		messageId: String(row.message_id)
	};
}
