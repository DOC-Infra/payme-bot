import type { Task } from '../core/tasks';
import type { Storage } from './storage';

type Row = Record<string, unknown>;

export function selectTask(storage: Storage, id: number): Task | null {
	const row = storage.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
	return row ? toTask(storage, row) : null;
}

export function selectTasks(storage: Storage): Task[] {
	return storage.db
		.prepare('SELECT * FROM tasks ORDER BY name')
		.all()
		.map((row) => toTask(storage, row));
}

export function selectTaskIdByName(storage: Storage, name: string): number | null {
	const row = storage.db.prepare('SELECT id FROM tasks WHERE name = ?').get(name);
	return row ? Number(row.id) : null;
}

export function insertTask(storage: Storage, name: string, rate: number, jobIds: readonly number[]): number {
	const result = storage.db.prepare('INSERT INTO tasks (name, rate) VALUES (?, ?)').run(name, rate);
	const id = Number(result.lastInsertRowid);
	for (const jobId of jobIds) insertTaskJob(storage, id, jobId);
	return id;
}

export function insertTaskJob(storage: Storage, taskId: number, jobId: number) {
	storage.db.prepare('INSERT OR IGNORE INTO task_jobs (task_id, job_id) VALUES (?, ?)').run(taskId, jobId);
}

export function deleteTaskJob(storage: Storage, taskId: number, jobId: number) {
	storage.db.prepare('DELETE FROM task_jobs WHERE task_id = ? AND job_id = ?').run(taskId, jobId);
}

export function updateTaskRate(storage: Storage, id: number, rate: number) {
	storage.db.prepare('UPDATE tasks SET rate = ? WHERE id = ?').run(rate, id);
}

export function countActiveTasks(storage: Storage, jobId: number): number {
	const row = storage.db
		.prepare(
			'SELECT COUNT(*) AS count FROM tasks JOIN task_jobs ON task_jobs.task_id = tasks.id WHERE task_jobs.job_id = ? AND tasks.retired = 0'
		)
		.get(jobId);
	return Number(row?.count);
}

export function markTaskRetired(storage: Storage, id: number) {
	storage.db.prepare('UPDATE tasks SET retired = 1 WHERE id = ?').run(id);
}

export function retireTasksWithNoActiveJob(storage: Storage, jobId: number) {
	storage.db
		.prepare(
			`UPDATE tasks SET retired = 1
			WHERE retired = 0
				AND id IN (SELECT task_id FROM task_jobs WHERE job_id = ?)
				AND NOT EXISTS (
					SELECT 1 FROM task_jobs JOIN jobs ON jobs.id = task_jobs.job_id
					WHERE task_jobs.task_id = tasks.id AND jobs.retired = 0
				)`
		)
		.run(jobId);
}

function toTask(storage: Storage, row: Row): Task {
	const id = Number(row.id);
	return {
		id,
		name: String(row.name),
		rate: Number(row.rate),
		jobIds: selectTaskJobIds(storage, id),
		retired: row.retired === 1
	};
}

function selectTaskJobIds(storage: Storage, taskId: number): number[] {
	return storage.db
		.prepare('SELECT job_id FROM task_jobs WHERE task_id = ? ORDER BY job_id')
		.all(taskId)
		.map((row) => Number(row.job_id));
}
