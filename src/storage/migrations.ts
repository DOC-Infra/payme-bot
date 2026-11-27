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
	},
	{
		name: '0006-task-evidence-required',
		sql: `ALTER TABLE tasks ADD COLUMN evidence_required INTEGER NOT NULL DEFAULT 1;`
	},
	{
		name: '0007-task-notes-required',
		sql: `ALTER TABLE tasks ADD COLUMN notes_required INTEGER NOT NULL DEFAULT 1;`
	},
	{
		name: '0008-payment-request-ticket',
		sql: `
			ALTER TABLE payment_requests ADD COLUMN ticket TEXT;
			UPDATE payment_requests
			SET ticket = (
				SELECT substr(evidence.value, 8)
				FROM payment_request_evidence AS evidence
				WHERE evidence.request_number = payment_requests.number
					AND evidence.round = 1
					AND evidence.kind = 'notes'
					AND evidence.value GLOB 'Ticket [0-9][0-9][0-9][0-9][0-9]'
			)
			WHERE task_id IN (SELECT id FROM tasks WHERE name = 'DOC Ticket Assistance');
			CREATE INDEX payment_requests_by_ticket ON payment_requests (employee_user_id, ticket) WHERE ticket IS NOT NULL;
		`
	},
	{
		name: '0009-projects',
		sql: `
			CREATE TABLE projects (
				id INTEGER PRIMARY KEY,
				name TEXT NOT NULL UNIQUE COLLATE NOCASE,
				job_id INTEGER NOT NULL REFERENCES jobs (id),
				state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
				created_by TEXT NOT NULL
			);
			CREATE TABLE project_funding (
				id INTEGER PRIMARY KEY,
				project_id INTEGER NOT NULL REFERENCES projects (id),
				amount INTEGER NOT NULL,
				actor_user_id TEXT NOT NULL,
				at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);
			CREATE INDEX project_funding_by_project ON project_funding (project_id);
			CREATE TABLE project_shares (
				id INTEGER PRIMARY KEY,
				project_id INTEGER NOT NULL REFERENCES projects (id),
				employee_user_id TEXT NOT NULL REFERENCES employees (user_id),
				amount INTEGER NOT NULL,
				note TEXT,
				actor_user_id TEXT NOT NULL,
				paid INTEGER NOT NULL DEFAULT 0,
				at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);
			CREATE INDEX project_shares_by_project ON project_shares (project_id);
			CREATE INDEX project_shares_unpaid ON project_shares (employee_user_id) WHERE paid = 0;
			CREATE TABLE payout_share_lines (
				payout_number INTEGER NOT NULL REFERENCES payouts (number),
				share_id INTEGER NOT NULL REFERENCES project_shares (id),
				project_id INTEGER NOT NULL REFERENCES projects (id),
				job_id INTEGER NOT NULL REFERENCES jobs (id),
				amount INTEGER NOT NULL,
				PRIMARY KEY (payout_number, share_id)
			);
			CREATE INDEX payout_share_lines_by_share ON payout_share_lines (share_id);
		`
	},
	{
		name: '0010-project-share-removed',
		sql: `ALTER TABLE project_shares ADD COLUMN removed INTEGER NOT NULL DEFAULT 0;`
	},
	{
		name: '0011-settings',
		sql: `
			CREATE TABLE settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
		`
	},
	{
		name: '0012-payout-revision',
		sql: `ALTER TABLE payouts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;`
	},
	{
		name: '0013-appropriations',
		sql: `
			CREATE TABLE appropriations (
				id INTEGER PRIMARY KEY,
				from_month TEXT NOT NULL,
				amount INTEGER NOT NULL,
				actor_user_id TEXT NOT NULL,
				at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);
		`
	},
	{
		name: '0014-spending-categories',
		sql: `
			CREATE TABLE spending_categories (
				id INTEGER PRIMARY KEY,
				name TEXT NOT NULL UNIQUE COLLATE NOCASE,
				built_in INTEGER NOT NULL DEFAULT 0,
				retired INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE spending_category_jobs (
				category_id INTEGER NOT NULL REFERENCES spending_categories (id),
				job_id INTEGER NOT NULL REFERENCES jobs (id),
				PRIMARY KEY (category_id, job_id)
			);
			INSERT INTO spending_categories (name, built_in) VALUES ('Employee Pay', 1);
		`
	},
	{
		name: '0015-spending-category-targets',
		sql: `
			CREATE TABLE spending_category_targets (
				id INTEGER PRIMARY KEY,
				category_id INTEGER NOT NULL REFERENCES spending_categories (id),
				from_month TEXT NOT NULL,
				percent INTEGER,
				actor_user_id TEXT NOT NULL,
				at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);
		`
	},
	{
		name: '0016-disbursements',
		sql: `
			CREATE TABLE disbursements (
				number INTEGER PRIMARY KEY,
				category_id INTEGER NOT NULL REFERENCES spending_categories (id),
				job_id INTEGER REFERENCES jobs (id),
				recipient TEXT NOT NULL,
				amount INTEGER NOT NULL,
				reason TEXT NOT NULL,
				link TEXT,
				state TEXT NOT NULL CHECK (state IN ('requested', 'paid', 'declined', 'withdrawn', 'voided')),
				requested_by TEXT NOT NULL,
				requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				settled_by TEXT,
				settled_at TEXT,
				channel_id TEXT,
				message_id TEXT
			);
			CREATE INDEX disbursements_by_state ON disbursements (state);
		`
	},
	{
		name: '0017-disbursement-outcome-reason',
		sql: `ALTER TABLE disbursements ADD COLUMN outcome_reason TEXT;`
	}
];
