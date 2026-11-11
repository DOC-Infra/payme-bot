import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrations as allMigrations } from './migrations';

export interface Migration {
	name: string;
	sql: string;
}

export type Db = BetterSQLite3Database & { $client: Database.Database };

export interface Storage {
	db: Db;
	transaction<T>(run: () => T): T;
	close(): void;
}

export function openStorage(path: string, migrations: readonly Migration[] = allMigrations): Storage {
	const db = drizzle(new Database(path));
	const storage: Storage = {
		db,
		transaction: (run) => db.transaction(() => run(), { behavior: 'immediate' }),
		close: () => db.$client.close()
	};
	migrate(storage, migrations);
	return storage;
}

function migrate(storage: Storage, migrations: readonly Migration[]) {
	const client = storage.db.$client;
	client.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
	const applied = new Set(
		client
			.prepare<[], { name: string }>('SELECT name FROM schema_migrations')
			.all()
			.map((row) => row.name)
	);
	const record = client.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, datetime('now'))");

	for (const migration of migrations) {
		if (applied.has(migration.name)) continue;
		storage.transaction(() => {
			client.exec(migration.sql);
			record.run(migration.name);
		});
	}
}
