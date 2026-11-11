import { and, asc, desc, eq, inArray, min, notInArray, sql } from 'drizzle-orm';
import type { PayoutState } from '../core/labels';
import type { Payout, PayoutLine } from '../core/payouts';
import { paymentRequestJobs, paymentRequests, payoutLines, payouts } from './schema';
import type { Storage } from './storage';

type PayoutRow = typeof payouts.$inferSelect;

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
	const { employeeUserId, minecraftName, generatedBy, lines } = payout;
	const total = lines.reduce((sum, line) => sum + line.rate, 0);
	const { number } = db
		.insert(payouts)
		.values({ employeeUserId, minecraftName, total, state: 'open', generatedBy })
		.returning({ number: payouts.number })
		.get();
	if (lines.length > 0) {
		db.insert(payoutLines)
			.values(lines.map(({ requestNumber, taskId, jobId, rate }) => ({ payoutNumber: number, requestNumber, taskId, jobId, rate })))
			.run();
	}
	return number;
}

/** Moves an Open Payout to `to`, recording who settled it. False if it was no longer Open. */
export function settlePayout(storage: Storage, number: number, to: Exclude<PayoutState, 'open'>, actorUserId: string): boolean {
	const { changes } = storage.db
		.update(payouts)
		.set({ state: to, settledBy: actorUserId, settledAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` })
		.where(and(eq(payouts.number, number), eq(payouts.state, 'open')))
		.run();
	return changes > 0;
}

export function selectPayout(storage: Storage, number: number): Payout | null {
	const row = storage.db.select().from(payouts).where(eq(payouts.number, number)).get();
	return row ? toPayout(storage, row) : null;
}

export function selectOpenPayout(storage: Storage, employeeUserId: string): Payout | null {
	const row = storage.db
		.select()
		.from(payouts)
		.where(and(eq(payouts.employeeUserId, employeeUserId), eq(payouts.state, 'open')))
		.get();
	return row ? toPayout(storage, row) : null;
}

export function selectPayoutsInState(storage: Storage, ...states: PayoutState[]): Payout[] {
	return storage.db
		.select()
		.from(payouts)
		.where(inArray(payouts.state, states))
		.orderBy(desc(payouts.number))
		.all()
		.map((row) => toPayout(storage, row));
}

/** Approved requests that are not locked in an Open Payout, oldest first, each with its first eligible Job. */
export function selectUnpaidRequests(storage: Storage, employeeUserId: string | null = null): UnpaidRequestRow[] {
	const { db } = storage;
	const firstJob = db
		.select({ jobId: min(paymentRequestJobs.jobId) })
		.from(paymentRequestJobs)
		.where(eq(paymentRequestJobs.requestNumber, paymentRequests.number));
	const locked = db
		.select({ requestNumber: payoutLines.requestNumber })
		.from(payoutLines)
		.innerJoin(payouts, eq(payouts.number, payoutLines.payoutNumber))
		.where(eq(payouts.state, 'open'));
	return db
		.select({
			number: paymentRequests.number,
			employeeUserId: paymentRequests.employeeUserId,
			taskId: paymentRequests.taskId,
			jobId: sql<number>`(${firstJob})`
		})
		.from(paymentRequests)
		.where(
			and(
				eq(paymentRequests.state, 'approved'),
				employeeUserId === null ? undefined : eq(paymentRequests.employeeUserId, employeeUserId),
				notInArray(paymentRequests.number, locked)
			)
		)
		.orderBy(asc(paymentRequests.number))
		.all();
}

function toPayout(storage: Storage, row: PayoutRow): Payout {
	const lines = storage.db
		.select({ requestNumber: payoutLines.requestNumber, taskId: payoutLines.taskId, jobId: payoutLines.jobId, rate: payoutLines.rate })
		.from(payoutLines)
		.where(eq(payoutLines.payoutNumber, row.number))
		.orderBy(asc(payoutLines.requestNumber))
		.all();
	return { ...row, lines };
}
