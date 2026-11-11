import type { Migration } from './storage';

export const migrations: Migration[] = [
	{
		name: '0001-jobs',
		sql: `
			CREATE TABLE jobs (
				id INTEGER PRIMARY KEY,
				name TEXT NOT NULL UNIQUE COLLATE NOCASE,
				employee_role_id TEXT NOT NULL,
				review_channel_id TEXT NOT NULL,
				retired INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE job_manager_roles (
				job_id INTEGER NOT NULL REFERENCES jobs (id),
				role_id TEXT NOT NULL,
				PRIMARY KEY (job_id, role_id)
			);
		`
	},
	{
		name: '0003-employees',
		sql: `
			CREATE TABLE employees (
				user_id TEXT PRIMARY KEY,
				minecraft_name TEXT NOT NULL,
				channel_id TEXT UNIQUE,
				thread_id TEXT,
				pinned_message_id TEXT
			);
		`
	}
];
