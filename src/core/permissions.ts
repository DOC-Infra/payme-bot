import type { Actor } from './actor';
import { fail, type Failure } from './outcome';
import type { PayMe } from './payme';

/** Leadership is anyone with Discord's Administrator permission on the server. */
export function isLeadership(_payMe: PayMe, actor: Actor): boolean {
	return actor.administrator;
}

export function requireLeadership(payMe: PayMe, actor: Actor): Failure | null {
	return isLeadership(payMe, actor) ? null : fail({ code: 'not-permitted' });
}
