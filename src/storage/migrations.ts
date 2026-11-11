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
		name: '0002-tasks',
		sql: `
			CREATE TABLE tasks (
				id INTEGER PRIMARY KEY,
				name TEXT NOT NULL UNIQUE COLLATE NOCASE,
				rate INTEGER NOT NULL,
				retired INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE task_jobs (
				task_id INTEGER NOT NULL REFERENCES tasks (id),
				job_id INTEGER NOT NULL REFERENCES jobs (id),
				PRIMARY KEY (task_id, job_id)
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
	},
	{
		name: '0004-payment-requests',
		sql: `
			CREATE TABLE payment_requests (
				number INTEGER PRIMARY KEY,
				employee_user_id TEXT NOT NULL REFERENCES employees (user_id),
				task_id INTEGER NOT NULL REFERENCES tasks (id),
				state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'denied', 'withdrawn', 'paid')),
				round INTEGER NOT NULL DEFAULT 1
			);
			CREATE INDEX payment_requests_by_employee ON payment_requests (employee_user_id, state);
			CREATE TABLE payment_request_jobs (
				request_number INTEGER NOT NULL REFERENCES payment_requests (number),
				job_id INTEGER NOT NULL REFERENCES jobs (id),
				PRIMARY KEY (request_number, job_id)
			);
			CREATE TABLE payment_request_evidence (
				id INTEGER PRIMARY KEY,
				request_number INTEGER NOT NULL REFERENCES payment_requests (number),
				round INTEGER NOT NULL,
				kind TEXT NOT NULL CHECK (kind IN ('notes', 'link', 'attachment')),
				value TEXT NOT NULL,
				name TEXT
			);
			CREATE INDEX payment_request_evidence_by_request ON payment_request_evidence (request_number);
			CREATE TABLE payment_request_history (
				id INTEGER PRIMARY KEY,
				request_number INTEGER NOT NULL REFERENCES payment_requests (number),
				from_state TEXT,
				to_state TEXT NOT NULL,
				actor_user_id TEXT NOT NULL,
				reason TEXT,
				at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);
			CREATE INDEX payment_request_history_by_request ON payment_request_history (request_number);
			CREATE TABLE payment_request_messages (
				message_id TEXT PRIMARY KEY,
				request_number INTEGER NOT NULL REFERENCES payment_requests (number),
				round INTEGER NOT NULL,
				job_id INTEGER REFERENCES jobs (id),
				channel_id TEXT NOT NULL
			);
			CREATE INDEX payment_request_messages_by_request ON payment_request_messages (request_number);
		`
	},
	{
		name: '0005-payouts',
		sql: `
			CREATE TABLE payouts (
				number INTEGER PRIMARY KEY,
				employee_user_id TEXT NOT NULL REFERENCES employees (user_id),
				minecraft_name TEXT NOT NULL,
				total INTEGER NOT NULL,
				state TEXT NOT NULL CHECK (state IN ('open', 'paid', 'discarded')),
				generated_by TEXT NOT NULL,
				generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				settled_by TEXT,
				settled_at TEXT
			);
			CREATE UNIQUE INDEX payouts_one_open_per_employee ON payouts (employee_user_id) WHERE state = 'open';
			CREATE TABLE payout_lines (
				payout_number INTEGER NOT NULL REFERENCES payouts (number),
				request_number INTEGER NOT NULL REFERENCES payment_requests (number),
				task_id INTEGER NOT NULL REFERENCES tasks (id),
				job_id INTEGER NOT NULL REFERENCES jobs (id),
				rate INTEGER NOT NULL,
				PRIMARY KEY (payout_number, request_number)
			);
			CREATE INDEX payout_lines_by_request ON payout_lines (request_number);
		`
	}
];
