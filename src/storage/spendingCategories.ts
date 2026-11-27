import { asc, eq, lte } from 'drizzle-orm';
import type { SpendingCategory, Target } from '../core/spending-categories';
import { spendingCategories, spendingCategoryJobs, spendingCategoryTargets } from './schema';
import type { Storage } from './storage';

type CategoryRow = typeof spendingCategories.$inferSelect;

export function insertSpendingCategory(storage: Storage, name: string, jobIds: readonly number[]): number {
	const { id } = storage.db.insert(spendingCategories).values({ name }).returning({ id: spendingCategories.id }).get();
	replaceSpendingCategoryJobs(storage, id, jobIds);
	return id;
}

export function selectSpendingCategory(storage: Storage, id: number): SpendingCategory | null {
	const row = storage.db.select().from(spendingCategories).where(eq(spendingCategories.id, id)).get();
	return row ? toCategory(storage, row) : null;
}

/** Employee Pay first, then the rest by name. */
export function selectSpendingCategories(storage: Storage): SpendingCategory[] {
	return storage.db
		.select()
		.from(spendingCategories)
		.all()
		.map((row) => toCategory(storage, row))
		.sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name));
}

export function selectSpendingCategoryIdByName(storage: Storage, name: string): number | null {
	return storage.db.select({ id: spendingCategories.id }).from(spendingCategories).where(eq(spendingCategories.name, name)).get()?.id ?? null;
}

export function updateSpendingCategoryName(storage: Storage, id: number, name: string) {
	storage.db.update(spendingCategories).set({ name }).where(eq(spendingCategories.id, id)).run();
}

export function setSpendingCategoryRetired(storage: Storage, id: number, retired: boolean) {
	storage.db.update(spendingCategories).set({ retired }).where(eq(spendingCategories.id, id)).run();
}

export function replaceSpendingCategoryJobs(storage: Storage, categoryId: number, jobIds: readonly number[]) {
	storage.db.delete(spendingCategoryJobs).where(eq(spendingCategoryJobs.categoryId, categoryId)).run();
	if (jobIds.length === 0) return;
	storage.db
		.insert(spendingCategoryJobs)
		.values(jobIds.map((jobId) => ({ categoryId, jobId })))
		.run();
}

function toCategory(storage: Storage, row: CategoryRow): SpendingCategory {
	const jobIds = storage.db
		.select({ jobId: spendingCategoryJobs.jobId })
		.from(spendingCategoryJobs)
		.where(eq(spendingCategoryJobs.categoryId, row.id))
		.orderBy(asc(spendingCategoryJobs.jobId))
		.all()
		.map((link) => link.jobId);
	return { ...row, jobIds };
}

export function insertSpendingCategoryTarget(storage: Storage, categoryId: number, fromMonth: string, target: Target | null, actorUserId: string) {
	const percent = target?.kind === 'percent' ? target.value : null;
	const amount = target?.kind === 'amount' ? target.value : null;
	storage.db.insert(spendingCategoryTargets).values({ categoryId, fromMonth, percent, amount, actorUserId }).run();
}

/** Each Category's target in `month`: the latest set at or before it. Categories with none are left out. */
export function selectSpendingCategoryTargets(storage: Storage, month: string): Map<number, Target> {
	const rows = storage.db
		.select({ categoryId: spendingCategoryTargets.categoryId, percent: spendingCategoryTargets.percent, amount: spendingCategoryTargets.amount })
		.from(spendingCategoryTargets)
		.where(lte(spendingCategoryTargets.fromMonth, month))
		.orderBy(asc(spendingCategoryTargets.fromMonth), asc(spendingCategoryTargets.id))
		.all();
	const latest = new Map(rows.map((row) => [row.categoryId, toTarget(row.percent, row.amount)]));
	return new Map([...latest].filter((entry): entry is [number, Target] => entry[1] !== null));
}

function toTarget(percent: number | null, amount: number | null): Target | null {
	if (percent !== null) return { kind: 'percent', value: percent };
	if (amount !== null) return { kind: 'amount', value: amount };
	return null;
}
