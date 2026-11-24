import {
	deleteManagerRole,
	insertJob,
	insertManagerRole,
	markJobRetired,
	selectJob,
	selectJobIdByName,
	selectJobs,
	updateJob
} from '../storage/jobs';
import { selectEmployee } from '../storage/employees';
import { retireTasksWithNoActiveJob } from '../storage/tasks';
import type { Actor } from './actor';
import { notice, type Effect } from './effects';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { requireLeadership } from './permissions';

export interface JobDetails {
	name: string;
	employeeRoleId: string;
	reviewChannelId: string;
}

export interface Job extends JobDetails {
	id: number;
	managerRoleIds: string[];
	retired: boolean;
}

export function getJob(payMe: PayMe, id: number): Job | null {
	return selectJob(payMe.storage, id);
}

export function allJobs(payMe: PayMe): Job[] {
	return selectJobs(payMe.storage);
}

/** The name of the Review Channel PayMe creates or reuses for a Job, like `courier-review`. */
export function reviewChannelName(jobName: string): string {
	const slug = jobName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${slug || 'job'}-review`.slice(0, 100);
}

/** Why the actor can't create a Job with this name, checked before PayMe makes its Review Channel. */
export function checkNewJob(payMe: PayMe, actor: Actor, name: string): Failure | null {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	return selectJobIdByName(payMe.storage, name) === null ? null : fail({ code: 'job-name-taken', name });
}

export function createJob(payMe: PayMe, actor: Actor, details: JobDetails): Outcome<Job> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		if (selectJobIdByName(storage, details.name) !== null) return fail({ code: 'job-name-taken', name: details.name });

		const job = selectJob(storage, insertJob(storage, details))!;
		return succeed([{ type: 'private-reply', card: notice(`Created the ${job.name} Job.`) }], job);
	});
}

/** Renaming the Job renames its Review Channel to match. */
export function editJob(payMe: PayMe, actor: Actor, id: number, changes: Partial<JobDetails>): Outcome<Job> {
	let renamed: Effect | null = null;
	const outcome = changeJob(payMe, actor, id, (job) => {
		const name = changes.name ?? job.name;
		const holder = selectJobIdByName(payMe.storage, name);
		if (holder !== null && holder !== id) return fail({ code: 'job-name-taken', name });

		updateJob(payMe.storage, id, {
			name,
			employeeRoleId: changes.employeeRoleId ?? job.employeeRoleId,
			reviewChannelId: changes.reviewChannelId ?? job.reviewChannelId
		});
		if (name !== job.name)
			renamed = { type: 'rename-channel', channelId: changes.reviewChannelId ?? job.reviewChannelId, name: reviewChannelName(name) };
		return `Updated the ${name} Job.`;
	});
	if (!outcome.ok || !renamed) return outcome;
	return { ...outcome, effects: [renamed, ...outcome.effects] };
}

/**
 * Makes these exactly the Job's manager roles. The Review Channel follows: roles added can see it, roles removed no longer can.
 * `holderUserIds` are the members who hold the Job's Employee role; their Employee Channels become visible to each role added.
 */
export function setManagerRoles(payMe: PayMe, actor: Actor, id: number, roleIds: readonly string[], holderUserIds: string[]): Outcome<Job> {
	let added: string[] = [];
	let removed: string[] = [];
	const outcome = changeJob(payMe, actor, id, (job) => {
		const wanted = [...new Set(roleIds)];
		added = wanted.filter((roleId) => !job.managerRoleIds.includes(roleId));
		removed = job.managerRoleIds.filter((roleId) => !wanted.includes(roleId));
		for (const roleId of removed) deleteManagerRole(payMe.storage, id, roleId);
		for (const roleId of added) insertManagerRole(payMe.storage, id, roleId);
		const managers = wanted.length ? wanted.map((roleId) => `<@&${roleId}>`).join(', ') : 'no roles';
		return `The ${job.name} Job is now managed by ${managers}.`;
	});
	if (!outcome.ok) return outcome;

	const { reviewChannelId } = outcome.value;
	const review: Effect[] = [
		...(added.length ? [{ type: 'grant-channel-access' as const, channelId: reviewChannelId, roleIds: added }] : []),
		...(removed.length ? [{ type: 'revoke-channel-access' as const, channelId: reviewChannelId, roleIds: removed }] : [])
	];
	const grants: Effect[] = added.length
		? holderUserIds.flatMap((userId) => {
				const channelId = selectEmployee(payMe.storage, userId)?.channelId;
				return channelId ? [{ type: 'grant-channel-access' as const, channelId, roleIds: added }] : [];
			})
		: [];
	return { ...outcome, effects: [...review, ...grants, ...outcome.effects] };
}

export function retireJob(payMe: PayMe, actor: Actor, id: number): Outcome<Job> {
	return changeJob(payMe, actor, id, (job) => {
		markJobRetired(payMe.storage, id);
		retireTasksWithNoActiveJob(payMe.storage, id);
		return `Retired the ${job.name} Job and its Tasks that belong to no other active Job.`;
	});
}

export function describeJob(job: Job): string {
	const managers = job.managerRoleIds.length === 0 ? 'none' : job.managerRoleIds.map((id) => `<@&${id}>`).join(', ');
	return [
		`**${job.name}**${job.retired ? ' (retired)' : ''}`,
		`Employee role: <@&${job.employeeRoleId}>`,
		`Manager roles: ${managers}`,
		`Review Channel: <#${job.reviewChannelId}>`
	].join('\n');
}

function changeJob(payMe: PayMe, actor: Actor, id: number, change: (job: Job) => Failure | string): Outcome<Job> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		const job = selectJob(storage, id);
		if (!job) return fail({ code: 'job-not-found' });

		const result = change(job);
		if (typeof result !== 'string') return result;
		return succeed([{ type: 'private-reply', card: notice(result) }], selectJob(storage, id)!);
	});
}
