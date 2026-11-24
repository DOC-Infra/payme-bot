import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PayoutState } from '../core/labels';
import type { Payout, PayoutLine, PayoutShareLine } from '../core/payouts';
import { payoutLines, payoutShareLines, payouts } from './schema';
import type { Storage } from './storage';

type PayoutRow = typeof payouts.$inferSelect;

export interface NewPayoutRow {
	employeeUserId: string;
	minecraftName: string;
	generatedBy: string;
	total: number;
	lines: readonly PayoutLine[];
	shares: readonly PayoutShareLine[];
}

export function insertPayout(storage: Storage, payout: NewPayoutRow): number {
	const { db } = storage;
	const { employeeUserId, minecraftName, generatedBy, total, lines, shares } = payout;
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
	if (shares.length > 0) {
		db.insert(payoutShareLines)
			.values(shares.map(({ shareId, projectId, jobId, amount }) => ({ payoutNumber: number, shareId, projectId, jobId, amount })))
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

function toPayout(storage: Storage, row: PayoutRow): Payout {
	const lines = storage.db
		.select({ requestNumber: payoutLines.requestNumber, taskId: payoutLines.taskId, jobId: payoutLines.jobId, rate: payoutLines.rate })
		.from(payoutLines)
		.where(eq(payoutLines.payoutNumber, row.number))
		.orderBy(asc(payoutLines.requestNumber))
		.all();
	const shares = storage.db
		.select({
			shareId: payoutShareLines.shareId,
			projectId: payoutShareLines.projectId,
			jobId: payoutShareLines.jobId,
			amount: payoutShareLines.amount
		})
		.from(payoutShareLines)
		.where(eq(payoutShareLines.payoutNumber, row.number))
		.orderBy(asc(payoutShareLines.shareId))
		.all();
	return { ...row, lines, shares };
}
