import { describe, expect, it } from 'vitest';
import {
	setManagerRoles,
	addTask,
	checkNewJob,
	createJob,
	editJob,
	editTask,
	getJob,
	getTask,
	hireEmployee,
	jobTasksView,
	jobView,
	jobsView,
	recordRequestsThread,
	reviewChannelName,
	retireJob,
	retireTask,
	setTaskJobs,
	taskView,
	tasksView,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const manager = member('user-casey', 'role-courier-manager');
const notPermitted = { ok: false, error: { code: 'not-permitted' } };

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

function job(payMe: PayMe, name: string) {
	const slug = name.toLowerCase();
	return created(createJob(payMe, leadership(), { name, employeeRoleId: `role-${slug}`, reviewChannelId: `review-${slug}` }));
}

function courierAndMiner() {
	const payMe = createTestPayMe();
	const courier = job(payMe, 'Courier');
	const miner = job(payMe, 'Miner');
	const parcel = created(addTask(payMe, leadership(), { name: 'Deliver Parcel', rate: '100', jobIds: [courier.id] }));
	return { payMe, courier, miner, parcel };
}

describe('Editing a Task from the dashboard', () => {
	it('changes the Rate and requirements together, saying what changed', () => {
		const { payMe, parcel } = courierAndMiner();

		expect(editTask(payMe, leadership(), parcel.id, { rate: '1500', evidenceRequired: false, notesRequired: true })).toMatchObject({
			ok: true,
			value: { rate: 150000, evidenceRequired: false, notesRequired: true },
			effects: [{ card: { description: 'The Deliver Parcel Task now pays $1,500 and no longer needs a link or a file.' } }]
		});
		expect(editTask(payMe, leadership(), parcel.id, { rate: '1500', evidenceRequired: false, notesRequired: true })).toMatchObject({
			effects: [{ card: { description: 'Nothing changed on the Deliver Parcel Task.' } }]
		});
	});

	it('refuses a bad Rate, changing nothing, and anyone but Leadership', () => {
		const { payMe, parcel } = courierAndMiner();

		expect(editTask(payMe, leadership(), parcel.id, { rate: '$5', evidenceRequired: false, notesRequired: false })).toEqual({
			ok: false,
			error: { code: 'invalid-rate', rate: '$5' }
		});
		expect(getTask(payMe, parcel.id)).toMatchObject({ rate: 10000, evidenceRequired: true, notesRequired: true });
		expect(editTask(payMe, manager, parcel.id, { rate: '5', evidenceRequired: true, notesRequired: true })).toEqual(notPermitted);
	});
});

describe("Setting a Task's Jobs", () => {
	it('makes the Task belong to exactly the Jobs picked, keeping a Retired Job it belonged to', () => {
		const { payMe, courier, miner, parcel } = courierAndMiner();
		const old = job(payMe, 'Old');
		const cart = created(addTask(payMe, leadership(), { name: 'Load Cart', rate: '5', jobIds: [courier.id, old.id] }));
		created(retireJob(payMe, leadership(), old.id));

		expect(setTaskJobs(payMe, leadership(), cart.id, [miner.id])).toMatchObject({
			ok: true,
			effects: [{ card: { description: 'The Load Cart Task now belongs to Miner.' } }]
		});
		expect(getTask(payMe, cart.id)?.jobIds.sort()).toEqual([miner.id, old.id].sort());
		expect(setTaskJobs(payMe, leadership(), parcel.id, [courier.id, miner.id])).toMatchObject({
			effects: [{ card: { description: 'The Deliver Parcel Task now belongs to Courier and Miner.' } }]
		});
	});

	it('refuses no Jobs and a Retired Job', () => {
		const { payMe, parcel } = courierAndMiner();
		const old = job(payMe, 'Old');
		created(retireJob(payMe, leadership(), old.id));

		expect(setTaskJobs(payMe, leadership(), parcel.id, [])).toEqual({ ok: false, error: { code: 'task-needs-a-job' } });
		expect(setTaskJobs(payMe, leadership(), parcel.id, [old.id])).toEqual({ ok: false, error: { code: 'job-retired', name: 'Old' } });
	});
});

describe("Setting a Job's manager roles", () => {
	it("adds and removes roles to match, updating who sees the Review Channel and letting only the added ones into holders' Employee Channels", () => {
		const { payMe, courier } = courierAndMiner();
		created(setManagerRoles(payMe, leadership(), courier.id, ['role-old-manager'], []));
		created(hireEmployee(payMe, leadership(), member('user-alex'), 'Alex_42'));
		recordRequestsThread(payMe, 'user-alex', { channelId: 'channel-alex', pinnedMessageId: 'pin', threadId: 'thread' });

		expect(setManagerRoles(payMe, leadership(), courier.id, ['role-a', 'role-b'], ['user-alex'])).toMatchObject({
			ok: true,
			effects: [
				{ type: 'grant-channel-access', channelId: 'review-courier', roleIds: ['role-a', 'role-b'] },
				{ type: 'revoke-channel-access', channelId: 'review-courier', roleIds: ['role-old-manager'] },
				{ type: 'grant-channel-access', channelId: 'channel-alex', roleIds: ['role-a', 'role-b'] },
				{ card: { description: 'The Courier Job is now managed by <@&role-a>, <@&role-b>.' } }
			]
		});
		expect(getJob(payMe, courier.id)?.managerRoleIds.sort()).toEqual(['role-a', 'role-b']);
		expect(setManagerRoles(payMe, leadership(), courier.id, [], [])).toMatchObject({
			effects: [
				{ type: 'revoke-channel-access', channelId: 'review-courier', roleIds: ['role-a', 'role-b'] },
				{ card: { description: 'The Courier Job is now managed by no roles.' } }
			]
		});
		expect(setManagerRoles(payMe, manager, courier.id, [], [])).toEqual(notPermitted);
	});
});

describe('Review Channels', () => {
	it('are named after the Job', () => {
		expect(reviewChannelName('Courier')).toBe('courier-review');
		expect(reviewChannelName('  Ore & Gem Mining!  ')).toBe('ore-gem-mining-review');
		expect(reviewChannelName('✨')).toBe('job-review');
	});

	it('are only made for Leadership, and not for a Job name already taken', () => {
		const { payMe } = courierAndMiner();

		expect(checkNewJob(payMe, leadership(), 'Builder')).toBeNull();
		expect(checkNewJob(payMe, leadership(), 'courier')).toEqual({ ok: false, error: { code: 'job-name-taken', name: 'courier' } });
		expect(checkNewJob(payMe, manager, 'Builder')).toEqual(notPermitted);
	});

	it('are renamed with their Job, and shut out every manager role that is removed', () => {
		const { payMe, courier } = courierAndMiner();
		created(setManagerRoles(payMe, leadership(), courier.id, ['role-b', 'role-a'], []));

		expect(editJob(payMe, leadership(), courier.id, { name: 'Couriers' })).toMatchObject({
			effects: [{ type: 'rename-channel', channelId: 'review-courier', name: 'couriers-review' }, { type: 'private-reply' }]
		});
		expect(editJob(payMe, leadership(), courier.id, { employeeRoleId: 'role-new' })).toMatchObject({ effects: [{ type: 'private-reply' }] });
		expect(setManagerRoles(payMe, leadership(), courier.id, [], [])).toMatchObject({
			effects: [{ type: 'revoke-channel-access', channelId: 'review-courier', roleIds: ['role-b', 'role-a'] }, { type: 'private-reply' }]
		});
	});
});

describe('The Job and Task views', () => {
	it('show Leadership every Job, and each one with the actions it allows', () => {
		const { payMe, courier, miner } = courierAndMiner();
		created(retireJob(payMe, leadership(), miner.id));

		expect(jobsView(payMe, leadership())).toMatchObject({
			effects: [
				{
					type: 'show-manage',
					view: {
						kind: 'jobs',
						jobs: [
							{ id: courier.id, label: 'Courier' },
							{ id: miner.id, label: 'Miner' }
						]
					}
				}
			]
		});
		expect(jobView(payMe, leadership(), courier.id)).toMatchObject({
			effects: [{ view: { kind: 'job', actions: ['edit', 'managers', 'retire'] } }]
		});
		expect(jobView(payMe, leadership(), miner.id)).toMatchObject({ effects: [{ view: { kind: 'job', actions: [] } }] });
		expect(jobsView(payMe, manager)).toEqual(notPermitted);
	});

	it('pick a Job, then one of its Tasks, offering Retire or Restore as the Task allows', () => {
		const { payMe, courier, miner, parcel } = courierAndMiner();
		const old = created(addTask(payMe, leadership(), { name: 'Old Route', rate: '5', jobIds: [courier.id] }));
		created(retireTask(payMe, leadership(), old.id));

		expect(tasksView(payMe, leadership())).toMatchObject({
			effects: [
				{
					view: {
						kind: 'tasks',
						jobs: [
							{ id: courier.id, label: 'Courier' },
							{ id: miner.id, label: 'Miner' }
						]
					}
				}
			]
		});
		expect(jobTasksView(payMe, leadership(), courier.id)).toMatchObject({
			effects: [
				{
					card: { title: 'Courier Tasks', description: '**Deliver Parcel**: $100\n**Old Route** (retired): $5' },
					view: {
						kind: 'job-tasks',
						canAdd: true,
						tasks: [
							{ id: parcel.id, label: 'Deliver Parcel' },
							{ id: old.id, label: 'Old Route (retired)' }
						]
					}
				}
			]
		});
		expect(taskView(payMe, leadership(), parcel.id)).toMatchObject({
			effects: [{ view: { kind: 'task', actions: ['edit', 'jobs', 'retire'] } }]
		});
		expect(taskView(payMe, leadership(), old.id)).toMatchObject({ effects: [{ view: { kind: 'task', actions: ['jobs', 'restore'] } }] });
		expect(taskView(payMe, manager, parcel.id)).toEqual(notPermitted);
	});
});
