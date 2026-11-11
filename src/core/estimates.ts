import type { PayMe } from './payme';

/** The Employee's Approved requests valued at current Rates, in hundredths. Only an estimate until a Payout freezes it (ADR 0001). */
export function estimateOwed(payMe: PayMe, employeeUserId: string): number {
	const row = payMe.storage.db
		.prepare(
			"SELECT COALESCE(SUM(tasks.rate), 0) AS owed FROM payment_requests JOIN tasks ON tasks.id = payment_requests.task_id WHERE employee_user_id = ? AND state = 'approved'"
		)
		.get(employeeUserId);
	return Number(row?.owed);
}
