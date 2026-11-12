import { describe, expect, it } from 'vitest';
import { addManagerRole, channelViewerRoleIds, createJob, jobsHeldBy, jobsManagedBy, retireJob, type Outcome, type PayMe } from '../../src/core';
import { createTestPayMe, leadership, leadershipRoleId, member } from '../support/payme';

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

function job(payMe: PayMe, name: string) {
	const slug = name.toLowerCase();
	const result = created(createJob(payMe, leadership(), { name, employeeRoleId: `role-${slug}`, reviewChannelId: `review-${slug}` }));
	addManagerRole(payMe, leadership(), result.id, `role-${slug}-manager`, []);
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
	it('lets Leadership and the Managers of each active Job the Employee holds see it, once each', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const miner = job(payMe, 'Miner');
		retireJob(payMe, leadership(), job(payMe, 'Logistics').id);
		addManagerRole(payMe, leadership(), miner.id, 'role-courier-manager', []);
		addManagerRole(payMe, leadership(), courier.id, leadershipRoleId, []);

		const alex = member('user-alex', 'role-courier', 'role-miner', 'role-logistics');

		expect(channelViewerRoleIds(payMe, alex)).toEqual([leadershipRoleId, 'role-courier-manager', 'role-miner-manager']);
	});

	it('lets only Leadership see the channel of an Employee who holds no Job', () => {
		const payMe = createTestPayMe();
		job(payMe, 'Courier');

		expect(channelViewerRoleIds(payMe, member('user-alex'))).toEqual([leadershipRoleId]);
	});
});
