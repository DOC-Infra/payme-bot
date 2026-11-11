import { DatabaseSync } from 'node:sqlite';
import { migrations as allMigrations } from './migrations';

export interface Migration {
	name: string;
	sql: string;
}

export interface Storage {
	db: DatabaseSync;
	transaction<T>(run: () => T): T;
	close(): void;
}

export function openStorage(path: string, migrations: readonly Migration[] = allMigrations): Storage {
	const db = new DatabaseSync(path);
	const storage: Storage = {
		db,
		transaction: (run) => transaction(db, run),
		close: () => db.close()
	};
	migrate(storage, migrations);
	return storage;
}

function transaction<T>(db: DatabaseSync, run: () => T): T {
	db.exec('BEGIN IMMEDIATE');
	try {
		const result = run();
		db.exec('COMMIT');
		return result;
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}

function migrate(storage: Storage, migrations: readonly Migration[]) {
	const { db } = storage;
	db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
	const applied = new Set(
		db
			.prepare('SELECT name FROM schema_migrations')
			.all()
			.map((row) => String(row.name))
	);
	const record = db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, datetime('now'))");

	for (const migration of migrations) {
		if (applied.has(migration.name)) continue;
		storage.transaction(() => {
			db.exec(migration.sql);
			record.run(migration.name);
		});
	}
}
