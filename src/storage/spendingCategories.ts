import { asc, eq } from 'drizzle-orm';
import type { SpendingCategory } from '../core/spending-categories';
import { spendingCategories, spendingCategoryJobs } from './schema';
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
		.orderBy(asc(spendingCategories.id))
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
	return { id: row.id, name: row.name, builtIn: row.builtIn, retired: row.retired, jobIds };
}
