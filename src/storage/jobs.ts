import { and, asc, eq, sql } from 'drizzle-orm';
import type { Job, JobDetails } from '../core/jobs';
import { jobManagerRoles, jobs } from './schema';
import type { Storage } from './storage';

type JobRow = typeof jobs.$inferSelect;

export function selectJob(storage: Storage, id: number): Job | null {
	const row = storage.db.select().from(jobs).where(eq(jobs.id, id)).get();
	return row ? toJob(storage, row) : null;
}

export function selectJobs(storage: Storage): Job[] {
	return storage.db
		.select()
		.from(jobs)
		.orderBy(asc(jobs.name))
		.all()
		.map((row) => toJob(storage, row));
}

export function selectJobIdByName(storage: Storage, name: string): number | null {
	const row = storage.db.select({ id: jobs.id }).from(jobs).where(eq(jobs.name, name)).get();
	return row?.id ?? null;
}

export function insertJob(storage: Storage, details: JobDetails): number {
	return storage.db.insert(jobs).values(jobDetails(details)).returning({ id: jobs.id }).get().id;
}

export function updateJob(storage: Storage, id: number, details: JobDetails) {
	storage.db.update(jobs).set(jobDetails(details)).where(eq(jobs.id, id)).run();
}

export function markJobRetired(storage: Storage, id: number) {
	storage.db.update(jobs).set({ retired: true }).where(eq(jobs.id, id)).run();
}

export function insertManagerRole(storage: Storage, jobId: number, roleId: string) {
	storage.db.insert(jobManagerRoles).values({ jobId, roleId }).onConflictDoNothing().run();
}

export function deleteManagerRole(storage: Storage, jobId: number, roleId: string) {
	storage.db
		.delete(jobManagerRoles)
		.where(and(eq(jobManagerRoles.jobId, jobId), eq(jobManagerRoles.roleId, roleId)))
		.run();
}

function jobDetails({ name, employeeRoleId, reviewChannelId }: JobDetails): JobDetails {
	return { name, employeeRoleId, reviewChannelId };
}

function toJob(storage: Storage, row: JobRow): Job {
	return { ...row, managerRoleIds: selectManagerRoleIds(storage, row.id) };
}

function selectManagerRoleIds(storage: Storage, jobId: number): string[] {
	return storage.db
		.select({ roleId: jobManagerRoles.roleId })
		.from(jobManagerRoles)
		.where(eq(jobManagerRoles.jobId, jobId))
		.orderBy(sql`rowid`)
		.all()
		.map((row) => row.roleId);
}
