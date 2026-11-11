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
import type { Actor } from './actor';
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

export function jobsHeldBy(payMe: PayMe, actor: Actor): Job[] {
	return allJobs(payMe).filter((job) => !job.retired && actor.roleIds.includes(job.employeeRoleId));
}

export function listJobs(payMe: PayMe, actor: Actor): Outcome<Job[]> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const jobs = allJobs(payMe);
	const content = jobs.length === 0 ? 'There are no Jobs yet.' : jobs.map(describeJob).join('\n');
	return succeed([{ type: 'private-reply', content }], jobs);
}

export function createJob(payMe: PayMe, actor: Actor, details: JobDetails): Outcome<Job> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		if (selectJobIdByName(storage, details.name) !== null) return fail({ code: 'job-name-taken', name: details.name });

		const job = selectJob(storage, insertJob(storage, details))!;
		return succeed([{ type: 'private-reply', content: `Created the ${job.name} Job.` }], job);
	});
}

export function editJob(payMe: PayMe, actor: Actor, id: number, changes: Partial<JobDetails>): Outcome<Job> {
	return changeJob(payMe, actor, id, (job) => {
		const name = changes.name ?? job.name;
		const holder = selectJobIdByName(payMe.storage, name);
		if (holder !== null && holder !== id) return fail({ code: 'job-name-taken', name });

		updateJob(payMe.storage, id, {
			name,
			employeeRoleId: changes.employeeRoleId ?? job.employeeRoleId,
			reviewChannelId: changes.reviewChannelId ?? job.reviewChannelId
		});
		return `Updated the ${name} Job.`;
	});
}

export function addManagerRole(payMe: PayMe, actor: Actor, id: number, roleId: string): Outcome<Job> {
	return changeJob(payMe, actor, id, (job) => {
		insertManagerRole(payMe.storage, id, roleId);
		return `<@&${roleId}> now manages the ${job.name} Job.`;
	});
}

export function removeManagerRole(payMe: PayMe, actor: Actor, id: number, roleId: string): Outcome<Job> {
	return changeJob(payMe, actor, id, (job) => {
		deleteManagerRole(payMe.storage, id, roleId);
		return `<@&${roleId}> no longer manages the ${job.name} Job.`;
	});
}

export function retireJob(payMe: PayMe, actor: Actor, id: number): Outcome<Job> {
	return changeJob(payMe, actor, id, (job) => {
		markJobRetired(payMe.storage, id);
		return `Retired the ${job.name} Job.`;
	});
}

function describeJob(job: Job): string {
	const managers = job.managerRoleIds.length === 0 ? 'none' : job.managerRoleIds.map((id) => `<@&${id}>`).join(', ');
	return [
		`**${job.name}**${job.retired ? ' (retired)' : ''}`,
		`Employee role: <@&${job.employeeRoleId}> | Manager roles: ${managers} | Review Channel: <#${job.reviewChannelId}>`
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
		return succeed([{ type: 'private-reply', content: result }], selectJob(storage, id)!);
	});
}
