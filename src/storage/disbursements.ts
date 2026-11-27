import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Disbursement } from '../core/disbursements';
import type { DisbursementState } from '../core/labels';
import { disbursements } from './schema';
import type { Storage } from './storage';

export interface NewDisbursementRow {
	categoryId: number;
	jobId: number | null;
	recipient: string;
	amount: number;
	reason: string;
	link: string | null;
	requestedBy: string;
}

export function insertDisbursement(storage: Storage, row: NewDisbursementRow): number {
	return storage.db
		.insert(disbursements)
		.values({ ...row, state: 'requested' })
		.returning({ number: disbursements.number })
		.get().number;
}

export function selectDisbursement(storage: Storage, number: number): Disbursement | null {
	return storage.db.select().from(disbursements).where(eq(disbursements.number, number)).get() ?? null;
}

/** Moves a Requested Disbursement to `to`, recording who did it. False if it was no longer Requested. */
export function settleDisbursement(
	storage: Storage,
	number: number,
	to: Exclude<DisbursementState, 'requested'>,
	actorUserId: string,
	reason: string | null = null,
	at = new Date().toISOString()
): boolean {
	const { changes } = storage.db
		.update(disbursements)
		.set({ state: to, settledBy: actorUserId, settledAt: at, outcomeReason: reason })
		.where(and(eq(disbursements.number, number), eq(disbursements.state, 'requested')))
		.run();
	return changes > 0;
}

export function updateDisbursementCard(storage: Storage, number: number, channelId: string, messageId: string) {
	storage.db.update(disbursements).set({ channelId, messageId }).where(eq(disbursements.number, number)).run();
}

/** Deletes the Disbursement if its card was never recorded. */
export function deleteUnpostedDisbursement(storage: Storage, number: number) {
	storage.db
		.delete(disbursements)
		.where(and(eq(disbursements.number, number), isNull(disbursements.messageId)))
		.run();
}

export function selectDisbursementsInState(storage: Storage, state: DisbursementState): Disbursement[] {
	return storage.db.select().from(disbursements).where(eq(disbursements.state, state)).orderBy(asc(disbursements.number)).all();
}

export function selectDisbursements(storage: Storage): Disbursement[] {
	return storage.db.select().from(disbursements).orderBy(asc(disbursements.number)).all();
}

/** Voids a Paid Disbursement, keeping who paid it and when. False if it was not Paid. */
export function voidPaidDisbursement(storage: Storage, number: number, actorUserId: string, reason: string): boolean {
	const { changes } = storage.db
		.update(disbursements)
		.set({ state: 'voided', voidedBy: actorUserId, voidedAt: new Date().toISOString(), outcomeReason: reason })
		.where(and(eq(disbursements.number, number), eq(disbursements.state, 'paid')))
		.run();
	return changes > 0;
}
