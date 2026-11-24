import { eq } from 'drizzle-orm';
import { settings } from './schema';
import type { Storage } from './storage';

export function selectSetting(storage: Storage, key: string): string | null {
	return storage.db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

export function saveSetting(storage: Storage, key: string, value: string | null) {
	if (value === null) {
		storage.db.delete(settings).where(eq(settings.key, key)).run();
		return;
	}
	storage.db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}
