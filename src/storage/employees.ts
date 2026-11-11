import { asc, eq } from 'drizzle-orm';
import type { Employee, RequestsThreadIds } from '../core/employees';
import { employees } from './schema';
import type { Storage } from './storage';

export function selectEmployee(storage: Storage, userId: string): Employee | null {
	return storage.db.select().from(employees).where(eq(employees.userId, userId)).get() ?? null;
}

export function selectEmployees(storage: Storage): Employee[] {
	return storage.db.select().from(employees).orderBy(asc(employees.userId)).all();
}

export function selectEmployeeIdByChannel(storage: Storage, channelId: string): string | null {
	const row = storage.db.select({ userId: employees.userId }).from(employees).where(eq(employees.channelId, channelId)).get();
	return row?.userId ?? null;
}

export function saveEmployee(storage: Storage, employee: Employee) {
	const { userId, minecraftName, channelId, threadId, pinnedMessageId } = employee;
	const details = { minecraftName, channelId, threadId, pinnedMessageId };
	storage.db
		.insert(employees)
		.values({ userId, ...details })
		.onConflictDoUpdate({ target: employees.userId, set: details })
		.run();
}

export function updateRequestsThread(storage: Storage, userId: string, ids: RequestsThreadIds) {
	const { channelId, pinnedMessageId, threadId } = ids;
	storage.db.update(employees).set({ channelId, pinnedMessageId, threadId }).where(eq(employees.userId, userId)).run();
}
