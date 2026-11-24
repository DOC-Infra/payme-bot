import { describe, expect, it } from 'vitest';
import {
	setManagerRoles,
	createJob,
	isLeadership,
	jobsHeldBy,
	jobsManagedBy,
	managerRoleIdsOfHeldJobs,
	retireJob,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

function job(payMe: PayMe, name: string) {
	const slug = name.toLowerCase();
	const result = created(createJob(payMe, leadership(), { name, employeeRoleId: `role-${slug}`, reviewChannelId: `review-${slug}` }));
	setManagerRoles(payMe, leadership(), result.id, [`role-${slug}-manager`], []);
	return result;
}

const names = (jobs: readonly { name: string }[]) => jobs.map((job) => job.name);

describe('Which Jobs a member holds', () => {
	it('holds each active Job whose Employee role they have, and not a Retired one', () => {
		const payMe = createTestPayMe();
		job(payMe, 'Courier');
		job(payMe, 'Miner');
		retireJob(payMe, leadership(), job(payMe, 'Logistics').id);

		const alex = member('user-alex', 'role-courier', 'role-logistics', 'role-miner-manager');

		expect(names(jobsHeldBy(payMe, alex))).toEqual(['Courier']);
	});
});

describe('Which Jobs a member manages', () => {
	it('manages each Job whose manager role they have, including a Retired one', () => {
		const payMe = createTestPayMe();
		job(payMe, 'Courier');
		job(payMe, 'Miner');
		retireJob(payMe, leadership(), job(payMe, 'Logistics').id);

		const sam = member('user-sam', 'role-courier-manager', 'role-logistics-manager', 'role-miner');

		expect(names(jobsManagedBy(payMe, sam))).toEqual(['Courier', 'Logistics']);
	});

	it('counts Leadership as a Manager of every Job', () => {
		const payMe = createTestPayMe();
		job(payMe, 'Courier');
		job(payMe, 'Miner');

		expect(names(jobsManagedBy(payMe, leadership()))).toEqual(['Courier', 'Miner']);
	});
});

describe("Which roles can see an Employee's channel", () => {
	it('lets the Managers of each active Job the Employee holds see it, once each; administrators see every channel anyway', () => {
		const payMe = createTestPayMe();
		job(payMe, 'Courier');
		const miner = job(payMe, 'Miner');
		retireJob(payMe, leadership(), job(payMe, 'Logistics').id);
		setManagerRoles(payMe, leadership(), miner.id, ['role-miner-manager', 'role-courier-manager'], []);

		const alex = member('user-alex', 'role-courier', 'role-miner', 'role-logistics');

		expect(managerRoleIdsOfHeldJobs(payMe, alex)).toEqual(['role-courier-manager', 'role-miner-manager']);
		expect(managerRoleIdsOfHeldJobs(payMe, member('user-sam'))).toEqual([]);
	});
});

describe('Leadership', () => {
	it("is anyone with the server's Administrator permission, whatever their roles", () => {
		const payMe = createTestPayMe();
		job(payMe, 'Courier');

		expect(isLeadership(payMe, leadership('user-ana'))).toBe(true);
		expect(isLeadership(payMe, member('user-bo', 'role-courier-manager', 'role-leadership'))).toBe(false);
		expect(names(jobsManagedBy(payMe, leadership('user-ana')))).toEqual(['Courier']);
	});
});
