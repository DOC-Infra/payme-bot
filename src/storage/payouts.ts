import type { PayoutState } from '../core/labels';
import type { Payout, PayoutLine } from '../core/payouts';
import type { Storage } from './storage';

type Row = Record<string, unknown>;

export interface NewPayoutRow {
	employeeUserId: string;
	minecraftName: string;
	generatedBy: string;
	lines: readonly PayoutLine[];
}

export interface UnpaidRequestRow {
	number: number;
	employeeUserId: string;
	taskId: number;
	jobId: number;
}

export function insertPayout(storage: Storage, payout: NewPayoutRow): number {
	const { db } = storage;
	const total = payout.lines.reduce((sum, line) => sum + line.rate, 0);
	const result = db
		.prepare("INSERT INTO payouts (employee_user_id, minecraft_name, total, state, generated_by) VALUES (?, ?, ?, 'open', ?)")
		.run(payout.employeeUserId, payout.minecraftName, total, payout.generatedBy);
	const number = Number(result.lastInsertRowid);
	const addLine = db.prepare('INSERT INTO payout_lines (payout_number, request_number, task_id, job_id, rate) VALUES (?, ?, ?, ?, ?)');
	for (const line of payout.lines) addLine.run(number, line.requestNumber, line.taskId, line.jobId, line.rate);
	return number;
}

/** Moves an Open Payout to `to`, recording who settled it. False if it was no longer Open. */
export function settlePayout(storage: Storage, number: number, to: Exclude<PayoutState, 'open'>, actorUserId: string): boolean {
	const { changes } = storage.db
		.prepare(
			"UPDATE payouts SET state = ?, settled_by = ?, settled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE number = ? AND state = 'open'"
		)
		.run(to, actorUserId, number);
	return Number(changes) > 0;
}

export function selectPayout(storage: Storage, number: number): Payout | null {
	const row = storage.db.prepare('SELECT * FROM payouts WHERE number = ?').get(number);
	return row ? toPayout(storage, row) : null;
}

export function selectOpenPayout(storage: Storage, employeeUserId: string): Payout | null {
	const row = storage.db.prepare("SELECT * FROM payouts WHERE employee_user_id = ? AND state = 'open'").get(employeeUserId);
	return row ? toPayout(storage, row) : null;
}

export function selectPayoutsInState(storage: Storage, ...states: PayoutState[]): Payout[] {
	return storage.db
		.prepare(`SELECT * FROM payouts WHERE state IN (${states.map(() => '?').join(', ')}) ORDER BY number DESC`)
		.all(...states)
		.map((row) => toPayout(storage, row));
}

/** Approved requests that are not locked in an Open Payout, oldest first, each with its first eligible Job. */
export function selectUnpaidRequests(storage: Storage, employeeUserId: string | null = null): UnpaidRequestRow[] {
	return storage.db
		.prepare(
			`SELECT number, employee_user_id, task_id,
				(SELECT MIN(job_id) FROM payment_request_jobs WHERE request_number = number) AS job_id
			FROM payment_requests
			WHERE state = 'approved'
				AND (? IS NULL OR employee_user_id = ?)
				AND number NOT IN (
					SELECT request_number FROM payout_lines JOIN payouts ON payouts.number = payout_lines.payout_number
					WHERE payouts.state = 'open'
				)
			ORDER BY number`
		)
		.all(employeeUserId, employeeUserId)
		.map((row) => ({
			number: Number(row.number),
			employeeUserId: String(row.employee_user_id),
			taskId: Number(row.task_id),
			jobId: Number(row.job_id)
		}));
}

function toPayout(storage: Storage, row: Row): Payout {
	const number = Number(row.number);
	return {
		number,
		employeeUserId: String(row.employee_user_id),
		minecraftName: String(row.minecraft_name),
		total: Number(row.total),
		state: row.state as PayoutState,
		lines: storage.db
			.prepare('SELECT * FROM payout_lines WHERE payout_number = ? ORDER BY request_number')
			.all(number)
			.map((line) => ({
				requestNumber: Number(line.request_number),
				taskId: Number(line.task_id),
				jobId: Number(line.job_id),
				rate: Number(line.rate)
			})),
		generatedBy: String(row.generated_by),
		generatedAt: String(row.generated_at),
		settledBy: row.settled_by === null ? null : String(row.settled_by),
		settledAt: row.settled_at === null ? null : String(row.settled_at)
	};
}
