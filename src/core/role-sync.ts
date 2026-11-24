import type { Effect } from './effects';
import { getEmployee } from './employees';
import { managerRoleIdsOfHeldJobs } from './job-membership';
import { succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';

export function syncJobRoles(payMe: PayMe, userId: string, oldRoleIds: string[], newRoleIds: string[]): Outcome {
	const channelId = getEmployee(payMe, userId)?.channelId;
	if (!channelId) return succeed();

	const gainedRoleIds = newRoleIds.filter((id) => !oldRoleIds.includes(id));
	const roleIds = managerRoleIdsOfHeldJobs(payMe, { userId, roleIds: gainedRoleIds, administrator: false });
	const effects: Effect[] = roleIds.length === 0 ? [] : [{ type: 'grant-channel-access', channelId, roleIds }];
	return succeed(effects);
}
