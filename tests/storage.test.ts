import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openStorage, type Migration } from '../src/storage/storage';

const migrations: Migration[] = [
	{ name: '0001-widgets', sql: 'CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)' },
	{ name: '0002-widget-colour', sql: "ALTER TABLE widgets ADD COLUMN colour TEXT NOT NULL DEFAULT 'red'" }
];

describe('storage', () => {
	it('applies migrations in order to an in-memory database', () => {
		const storage = openStorage(':memory:', migrations);

		storage.db.prepare('INSERT INTO widgets (name) VALUES (?)').run('gear');

		expect(storage.db.prepare('SELECT name, colour FROM widgets').all()).toEqual([{ name: 'gear', colour: 'red' }]);
	});

	it('applies only pending migrations when an existing database is reopened', () => {
		const path = join(mkdtempSync(join(tmpdir(), 'payme-')), 'payme.db');
		const first = openStorage(path, migrations.slice(0, 1));
		first.db.prepare('INSERT INTO widgets (name) VALUES (?)').run('gear');
		first.close();

		const second = openStorage(path, migrations);

		expect(second.db.prepare('SELECT name, colour FROM widgets').all()).toEqual([{ name: 'gear', colour: 'red' }]);
		second.close();
	});

	it('rolls back a transaction that throws', () => {
		const storage = openStorage(':memory:', migrations);

		expect(() =>
			storage.transaction(() => {
				storage.db.prepare('INSERT INTO widgets (name) VALUES (?)').run('gear');
				throw new Error('boom');
			})
		).toThrow('boom');

		expect(storage.db.prepare('SELECT name FROM widgets').all()).toEqual([]);
	});
});
