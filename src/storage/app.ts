import { eq } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { openStorage, type Migration, type Storage } from './storage';

/** Data that belongs to a user rather than to any one server: kept apart from every server's database. */
const appMigrations: Migration[] = [
	{
		name: '0001-user-homes',
		sql: `
			CREATE TABLE user_homes (
				user_id TEXT PRIMARY KEY,
				guild_id TEXT NOT NULL
			);
		`
	}
];

const userHomes = sqliteTable('user_homes', {
	userId: text('user_id').primaryKey(),
	guildId: text('guild_id').notNull()
});

export function openAppStorage(path: string): Storage {
	return openStorage(path, appMigrations);
}

/** The server the user picked to file their requests in when they use PayMe outside a PayMe server. */
export function selectHome(storage: Storage, userId: string): string | null {
	return storage.db.select({ guildId: userHomes.guildId }).from(userHomes).where(eq(userHomes.userId, userId)).get()?.guildId ?? null;
}

export function saveHome(storage: Storage, userId: string, guildId: string) {
	storage.db.insert(userHomes).values({ userId, guildId }).onConflictDoUpdate({ target: userHomes.userId, set: { guildId } }).run();
}
