import type { Effect } from './effects';
import { getEmployee } from './employees';
import { jobsHeldBy } from './jobs';
import { succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';

export function syncJobRoles(payMe: PayMe, userId: string, oldRoleIds: string[], newRoleIds: string[]): Outcome {
	const channelId = getEmployee(payMe, userId)?.channelId;
	if (!channelId) return succeed();

	const gainedRoleIds = newRoleIds.filter((id) => !oldRoleIds.includes(id));
	const roleIds = [...new Set(jobsHeldBy(payMe, { userId, roleIds: gainedRoleIds }).flatMap((job) => job.managerRoleIds))];
	const effects: Effect[] = roleIds.length === 0 ? [] : [{ type: 'grant-channel-access', channelId, roleIds }];
	return succeed(effects);
}
