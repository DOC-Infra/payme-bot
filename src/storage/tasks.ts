import { and, asc, count, eq, inArray, notExists } from 'drizzle-orm';
import type { Task } from '../core/tasks';
import { jobs, taskJobs, tasks } from './schema';
import type { Storage } from './storage';

type TaskRow = typeof tasks.$inferSelect;

export function selectTask(storage: Storage, id: number): Task | null {
	const row = storage.db.select().from(tasks).where(eq(tasks.id, id)).get();
	return row ? toTask(storage, row) : null;
}

export function selectTasks(storage: Storage): Task[] {
	return storage.db
		.select()
		.from(tasks)
		.orderBy(asc(tasks.name))
		.all()
		.map((row) => toTask(storage, row));
}

export function selectTaskIdByName(storage: Storage, name: string): number | null {
	const row = storage.db.select({ id: tasks.id }).from(tasks).where(eq(tasks.name, name)).get();
	return row?.id ?? null;
}

export interface TaskRequirements {
	evidenceRequired: boolean;
	notesRequired: boolean;
}

export function insertTask(storage: Storage, name: string, rate: number, requirements: TaskRequirements, jobIds: readonly number[]): number {
	const { evidenceRequired, notesRequired } = requirements;
	const { id } = storage.db.insert(tasks).values({ name, rate, evidenceRequired, notesRequired }).returning({ id: tasks.id }).get();
	for (const jobId of jobIds) insertTaskJob(storage, id, jobId);
	return id;
}

export function insertTaskJob(storage: Storage, taskId: number, jobId: number) {
	storage.db.insert(taskJobs).values({ taskId, jobId }).onConflictDoNothing().run();
}

export function deleteTaskJob(storage: Storage, taskId: number, jobId: number) {
	storage.db
		.delete(taskJobs)
		.where(and(eq(taskJobs.taskId, taskId), eq(taskJobs.jobId, jobId)))
		.run();
}

export function updateTaskRate(storage: Storage, id: number, rate: number) {
	updateTask(storage, id, { rate });
}

export function updateTaskEvidenceRequired(storage: Storage, id: number, evidenceRequired: boolean) {
	updateTask(storage, id, { evidenceRequired });
}

export function updateTaskNotesRequired(storage: Storage, id: number, notesRequired: boolean) {
	updateTask(storage, id, { notesRequired });
}

export function setTaskRetired(storage: Storage, id: number, retired: boolean) {
	updateTask(storage, id, { retired });
}

export function countActiveTasks(storage: Storage, jobId: number): number {
	const row = storage.db
		.select({ count: count() })
		.from(tasks)
		.innerJoin(taskJobs, eq(taskJobs.taskId, tasks.id))
		.where(and(eq(taskJobs.jobId, jobId), eq(tasks.retired, false)))
		.get();
	return row?.count ?? 0;
}

export function retireTasksWithNoActiveJob(storage: Storage, jobId: number) {
	const { db } = storage;
	const tasksOfJob = db.select({ taskId: taskJobs.taskId }).from(taskJobs).where(eq(taskJobs.jobId, jobId));
	const activeJobOfTask = db
		.select()
		.from(taskJobs)
		.innerJoin(jobs, eq(jobs.id, taskJobs.jobId))
		.where(and(eq(taskJobs.taskId, tasks.id), eq(jobs.retired, false)));
	db.update(tasks)
		.set({ retired: true })
		.where(and(eq(tasks.retired, false), inArray(tasks.id, tasksOfJob), notExists(activeJobOfTask)))
		.run();
}

function updateTask(storage: Storage, id: number, changes: Partial<Omit<TaskRow, 'id'>>) {
	storage.db.update(tasks).set(changes).where(eq(tasks.id, id)).run();
}

function toTask(storage: Storage, row: TaskRow): Task {
	return { ...row, jobIds: selectTaskJobIds(storage, row.id) };
}

function selectTaskJobIds(storage: Storage, taskId: number): number[] {
	return storage.db
		.select({ jobId: taskJobs.jobId })
		.from(taskJobs)
		.where(eq(taskJobs.taskId, taskId))
		.orderBy(asc(taskJobs.jobId))
		.all()
		.map((row) => row.jobId);
}
