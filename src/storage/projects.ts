import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { Project, Share } from '../core/projects';
import { projectFunding, projectShares, projects } from './schema';
import type { Storage } from './storage';

type ProjectRow = typeof projects.$inferSelect;

export interface NewProjectRow {
	name: string;
	jobId: number;
	createdBy: string;
}

export interface NewShareRow {
	projectId: number;
	employeeUserId: string;
	amount: number;
	note: string | null;
	actorUserId: string;
}

export function insertProject(storage: Storage, project: NewProjectRow): number {
	return storage.db
		.insert(projects)
		.values({ ...project, state: 'open' })
		.returning({ id: projects.id })
		.get().id;
}

export function selectProject(storage: Storage, id: number): Project | null {
	const row = storage.db.select().from(projects).where(eq(projects.id, id)).get();
	return row ? toProject(storage, row) : null;
}

export function selectProjects(storage: Storage): Project[] {
	return storage.db
		.select()
		.from(projects)
		.orderBy(asc(projects.name))
		.all()
		.map((row) => toProject(storage, row));
}

export function selectProjectIdByName(storage: Storage, name: string): number | null {
	const row = storage.db.select({ id: projects.id }).from(projects).where(eq(projects.name, name)).get();
	return row?.id ?? null;
}

export function markProjectClosed(storage: Storage, id: number) {
	storage.db.update(projects).set({ state: 'closed' }).where(eq(projects.id, id)).run();
}

export function insertFunding(storage: Storage, projectId: number, amount: number, actorUserId: string) {
	storage.db.insert(projectFunding).values({ projectId, amount, actorUserId }).run();
}

export function insertShare(storage: Storage, share: NewShareRow): number {
	return storage.db.insert(projectShares).values(share).returning({ id: projectShares.id }).get().id;
}

export function selectShare(storage: Storage, id: number): Share | null {
	return selectShares(storage, eq(projectShares.id, id))[0] ?? null;
}

export function updateShare(storage: Storage, id: number, changes: Pick<Share, 'amount' | 'note'>) {
	storage.db.update(projectShares).set(changes).where(eq(projectShares.id, id)).run();
}

export function markShareRemoved(storage: Storage, id: number) {
	storage.db.update(projectShares).set({ removed: true }).where(eq(projectShares.id, id)).run();
}

/** Shares not yet paid, including those locked in an Open Payout. */
export function selectUnpaidShares(storage: Storage, employeeUserId?: string): Share[] {
	const employee = employeeUserId === undefined ? undefined : eq(projectShares.employeeUserId, employeeUserId);
	return selectShares(storage, and(eq(projectShares.paid, false), employee));
}

/** Marks the unpaid Shares paid, returning how many were. */
export function markSharesPaid(storage: Storage, ids: readonly number[]): number {
	if (ids.length === 0) return 0;
	return storage.db
		.update(projectShares)
		.set({ paid: true })
		.where(and(inArray(projectShares.id, ids), eq(projectShares.paid, false)))
		.run().changes;
}

/** Removed Shares are never selected. */
function selectShares(storage: Storage, where: SQL | undefined): Share[] {
	return storage.db
		.select({
			id: projectShares.id,
			projectId: projectShares.projectId,
			jobId: projects.jobId,
			employeeUserId: projectShares.employeeUserId,
			amount: projectShares.amount,
			note: projectShares.note,
			actorUserId: projectShares.actorUserId,
			paid: projectShares.paid,
			at: projectShares.at
		})
		.from(projectShares)
		.innerJoin(projects, eq(projects.id, projectShares.projectId))
		.where(and(eq(projectShares.removed, false), where))
		.orderBy(asc(projectShares.id))
		.all();
}

function toProject(storage: Storage, row: ProjectRow): Project {
	const funding = storage.db
		.select({ amount: projectFunding.amount, actorUserId: projectFunding.actorUserId, at: projectFunding.at })
		.from(projectFunding)
		.where(eq(projectFunding.projectId, row.id))
		.orderBy(asc(projectFunding.id))
		.all();
	return { ...row, funding, shares: selectShares(storage, eq(projectShares.projectId, row.id)) };
}
