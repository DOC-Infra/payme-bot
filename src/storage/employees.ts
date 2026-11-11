import type { Employee, RequestsThreadIds } from '../core/employees';
import type { Storage } from './storage';

export function selectEmployee(storage: Storage, userId: string): Employee | null {
	const row = storage.db.prepare('SELECT * FROM employees WHERE user_id = ?').get(userId);
	if (!row) return null;
	return {
		userId: String(row.user_id),
		minecraftName: String(row.minecraft_name),
		channelId: nullableString(row.channel_id),
		threadId: nullableString(row.thread_id),
		pinnedMessageId: nullableString(row.pinned_message_id)
	};
}

export function selectEmployeeIdByChannel(storage: Storage, channelId: string): string | null {
	const row = storage.db.prepare('SELECT user_id FROM employees WHERE channel_id = ?').get(channelId);
	return row ? String(row.user_id) : null;
}

export function saveEmployee(storage: Storage, employee: Employee) {
	storage.db
		.prepare(
			`INSERT INTO employees (user_id, minecraft_name, channel_id, thread_id, pinned_message_id) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT (user_id) DO UPDATE SET minecraft_name = excluded.minecraft_name, channel_id = excluded.channel_id,
				thread_id = excluded.thread_id, pinned_message_id = excluded.pinned_message_id`
		)
		.run(employee.userId, employee.minecraftName, employee.channelId, employee.threadId, employee.pinnedMessageId);
}

export function updateRequestsThread(storage: Storage, userId: string, ids: RequestsThreadIds) {
	storage.db
		.prepare('UPDATE employees SET channel_id = ?, pinned_message_id = ?, thread_id = ? WHERE user_id = ?')
		.run(ids.channelId, ids.pinnedMessageId, ids.threadId, userId);
}

function nullableString(value: unknown): string | null {
	return value === null ? null : String(value);
}
