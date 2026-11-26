import { desc, lte } from 'drizzle-orm';
import { appropriations } from './schema';
import type { Storage } from './storage';

export function insertAppropriation(storage: Storage, fromMonth: string, amount: number, actorUserId: string) {
	storage.db.insert(appropriations).values({ fromMonth, amount, actorUserId }).run();
}

/** The amount in effect in `month`: the latest one set for the closest month at or before it. */
export function selectAppropriationFor(storage: Storage, month: string): number | null {
	const row = storage.db
		.select({ amount: appropriations.amount })
		.from(appropriations)
		.where(lte(appropriations.fromMonth, month))
		.orderBy(desc(appropriations.fromMonth), desc(appropriations.id))
		.limit(1)
		.get();
	return row?.amount ?? null;
}
