import type { Job, JobDetails } from '../core/jobs';
import type { Storage } from './storage';

type Row = Record<string, unknown>;

export function selectJob(storage: Storage, id: number): Job | null {
	const row = storage.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
	return row ? toJob(storage, row) : null;
}

export function selectJobs(storage: Storage): Job[] {
	return storage.db
		.prepare('SELECT * FROM jobs ORDER BY name')
		.all()
		.map((row) => toJob(storage, row));
}

export function selectJobIdByName(storage: Storage, name: string): number | null {
	const row = storage.db.prepare('SELECT id FROM jobs WHERE name = ?').get(name);
	return row ? Number(row.id) : null;
}

export function insertJob(storage: Storage, details: JobDetails): number {
	const result = storage.db
		.prepare('INSERT INTO jobs (name, employee_role_id, review_channel_id) VALUES (?, ?, ?)')
		.run(details.name, details.employeeRoleId, details.reviewChannelId);
	return Number(result.lastInsertRowid);
}

export function updateJob(storage: Storage, id: number, details: JobDetails) {
	storage.db
		.prepare('UPDATE jobs SET name = ?, employee_role_id = ?, review_channel_id = ? WHERE id = ?')
		.run(details.name, details.employeeRoleId, details.reviewChannelId, id);
}

export function markJobRetired(storage: Storage, id: number) {
	storage.db.prepare('UPDATE jobs SET retired = 1 WHERE id = ?').run(id);
}

export function insertManagerRole(storage: Storage, jobId: number, roleId: string) {
	storage.db.prepare('INSERT OR IGNORE INTO job_manager_roles (job_id, role_id) VALUES (?, ?)').run(jobId, roleId);
}

export function deleteManagerRole(storage: Storage, jobId: number, roleId: string) {
	storage.db.prepare('DELETE FROM job_manager_roles WHERE job_id = ? AND role_id = ?').run(jobId, roleId);
}

function toJob(storage: Storage, row: Row): Job {
	const id = Number(row.id);
	return {
		id,
		name: String(row.name),
		employeeRoleId: String(row.employee_role_id),
		reviewChannelId: String(row.review_channel_id),
		managerRoleIds: selectManagerRoleIds(storage, id),
		retired: row.retired === 1
	};
}

function selectManagerRoleIds(storage: Storage, jobId: number): string[] {
	return storage.db
		.prepare('SELECT role_id FROM job_manager_roles WHERE job_id = ? ORDER BY rowid')
		.all(jobId)
		.map((row) => String(row.role_id));
}
