import type { Actor } from './actor';
import { fail, type Failure } from './outcome';
import type { PayMe } from './payme';

export function isLeadership(payMe: PayMe, actor: Actor): boolean {
	return actor.roleIds.includes(payMe.config.leadershipRoleId);
}

export function requireLeadership(payMe: PayMe, actor: Actor): Failure | null {
	return isLeadership(payMe, actor) ? null : fail({ code: 'not-permitted' });
}
