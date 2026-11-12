import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPayMe } from '../src/core';
import { migrations } from '../src/storage/migrations';
import { openStorage } from '../src/storage/storage';

const ticketMigration = migrations.findIndex((migration) => migration.name === '0008-payment-request-ticket');

type OlderRequest = { task: 'DOC Ticket Assistance' | 'Deliver Parcel'; state?: string; notes: string[] };

/** A database migrated up to just before the ticket field, holding requests whose notes are given round by round. */
function olderDatabase(requests: OlderRequest[]): string {
	const path = join(mkdtempSync(join(tmpdir(), 'payme-')), 'payme.db');
	const storage = openStorage(path, migrations.slice(0, ticketMigration));
	const client = storage.db.$client;
	client.exec(`
		INSERT INTO employees (user_id, minecraft_name) VALUES ('user-alex', 'Alex_42');
		INSERT INTO tasks (name, rate) VALUES ('DOC Ticket Assistance', 100), ('Deliver Parcel', 100);
	`);
	const insertRequest = client.prepare(
		"INSERT INTO payment_requests (employee_user_id, task_id, state, round) VALUES ('user-alex', (SELECT id FROM tasks WHERE name = ?), ?, ?)"
	);
	const insertNotes = client.prepare("INSERT INTO payment_request_evidence (request_number, round, kind, value) VALUES (?, ?, 'notes', ?)");
	for (const { task, state = 'pending', notes } of requests) {
		const { lastInsertRowid } = insertRequest.run(task, state, notes.length);
		notes.forEach((text, index) => insertNotes.run(lastInsertRowid, index + 1, text));
	}
	storage.close();
	return path;
}

describe('Backfilling the ticket of older ticket claims', () => {
	it('records the ticket of each DOC Ticket Assistance request whose first notes are exactly a ticket line, and no other', () => {
		const path = olderDatabase([
			{ task: 'DOC Ticket Assistance', notes: ['Ticket 01234'] },
			{ task: 'DOC Ticket Assistance', state: 'withdrawn', notes: ['Ticket 55555'] },
			{ task: 'DOC Ticket Assistance', state: 'pending', notes: ['Ticket 22222', 'Ticket 22222, with the screenshot this time'] },
			{ task: 'Deliver Parcel', notes: ['Ticket 33333'] },
			{ task: 'DOC Ticket Assistance', notes: ['Helped on Ticket 44444'] },
			{ task: 'DOC Ticket Assistance', notes: ['Ticket 4444'] },
			{ task: 'DOC Ticket Assistance', notes: ['Helped out', 'Ticket 66666'] }
		]);

		const storage = openStorage(path);

		expect(storage.db.$client.prepare('SELECT number, ticket FROM payment_requests ORDER BY number').all()).toEqual([
			{ number: 1, ticket: '01234' },
			{ number: 2, ticket: '55555' },
			{ number: 3, ticket: '22222' },
			{ number: 4, ticket: null },
			{ number: 5, ticket: null },
			{ number: 6, ticket: null },
			{ number: 7, ticket: null }
		]);
		const requests = createPayMe(storage, { leadershipRoleId: 'role-leadership' }).requests;
		expect(requests.load(1)?.ticket).toBe('01234');
		expect(requests.ticketClaimed('user-alex', '01234')).toBe(true);
		expect(requests.ticketClaimed('user-alex', '55555')).toBe(false);
		expect(requests.ticketClaimed('user-alex', '33333')).toBe(false);
		storage.close();
	});
});
