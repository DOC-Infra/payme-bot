import type { Actor } from './actor';
import { allJobs, type Job } from './jobs';
import type { PayMe } from './payme';
import { isLeadership } from './permissions';

/** Retired Jobs are never held. */
export function jobsHeldBy(payMe: PayMe, member: Actor): Job[] {
	return allJobs(payMe).filter((job) => !job.retired && member.roleIds.includes(job.employeeRoleId));
}

/** The Jobs the member can request pay under: those they hold, or every active Job for Leadership. */
export function jobsRequestableBy(payMe: PayMe, member: Actor): Job[] {
	if (isLeadership(payMe, member)) return allJobs(payMe).filter((job) => !job.retired);
	return jobsHeldBy(payMe, member);
}

/** The Jobs the member manages, Retired ones included so their requests can still be reviewed and paid. Leadership manages every Job. */
export function jobsManagedBy(payMe: PayMe, member: Actor): Job[] {
	return allJobs(payMe).filter((job) => managesJob(payMe, member, job));
}

/** Whether the member can act as a Manager of the Job: they hold one of its manager roles, or they are Leadership. */
export function managesJob(payMe: PayMe, member: Actor, job: Job): boolean {
	return isLeadership(payMe, member) || job.managerRoleIds.some((roleId) => member.roleIds.includes(roleId));
}

/** The manager roles of each Job the member holds, once each: who to let into their channel when they take on Jobs. */
export function managerRoleIdsOfHeldJobs(payMe: PayMe, member: Actor): string[] {
	return [...new Set(jobsHeldBy(payMe, member).flatMap((job) => job.managerRoleIds))];
}

/** Whether the member holds the Job's role or one of its manager roles. Unlike `managesJob`, being Leadership doesn't count. */
export function worksIn(member: Actor, job: Job): boolean {
	return [job.employeeRoleId, ...job.managerRoleIds].some((roleId) => member.roleIds.includes(roleId));
}
