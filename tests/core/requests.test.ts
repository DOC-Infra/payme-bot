import { describe, expect, it } from 'vitest';
import {
	addManagerRole,
	addTask,
	addTaskToJob,
	createJob,
	getPaymentRequest,
	hireEmployee,
	recordRequestMessage,
	recordRequestsThread,
	requestEntry,
	requestForm,
	retireTask,
	submitRequest,
	type Actor,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const screenshot = { name: 'proof.png', url: 'https://cdn.example/proof.png' };

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

function task(payMe: PayMe, name: string, ...jobIds: number[]) {
	return created(addTask(payMe, leadership(), { name, rate: '100', jobIds }));
}

function hire(payMe: PayMe, userId: string) {
	created(hireEmployee(payMe, leadership(), member(userId), 'Alex_42'));
	recordRequestsThread(payMe, userId, { channelId: `channel-${userId}`, pinnedMessageId: `pin-${userId}`, threadId: `thread-${userId}` });
}

function submit(payMe: PayMe, actor: Actor, taskId: number) {
	return created(submitRequest(payMe, actor, { taskId, notes: 'Done', link: null, files: [screenshot] }));
}

describe('Opening the request form', () => {
	it('tells a member who has not been hired to ask Leadership to hire them', () => {
		const payMe = createTestPayMe();

		expect(requestForm(payMe, member('user-alex', 'role-courier'))).toEqual({ ok: false, error: { code: 'not-hired' } });
	});

	it('tells an Employee with no Jobs that they have none', () => {
		const payMe = createTestPayMe();
		task(payMe, 'Deliver Parcel', job(payMe, 'Courier').id);
		hire(payMe, 'user-alex');

		expect(requestForm(payMe, member('user-alex', 'role-unrelated'))).toEqual({ ok: false, error: { code: 'no-jobs' } });
	});

	it("offers only active Tasks from the Employee's current Jobs, by name", () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const miner = job(payMe, 'Miner');
		const logistics = job(payMe, 'Logistics');
		task(payMe, 'Mine Ore', miner.id);
		task(payMe, 'Deliver Parcel', courier.id);
		task(payMe, 'Load Cart', courier.id, logistics.id);
		task(payMe, 'Stack Crates', logistics.id);
		retireTask(payMe, leadership(), task(payMe, 'Old Route', courier.id).id);
		hire(payMe, 'user-alex');

		const form = created(requestForm(payMe, member('user-alex', 'role-courier', 'role-logistics')));

		expect(form.map((offered) => offered.name)).toEqual(['Deliver Parcel', 'Load Cart', 'Stack Crates']);
	});

	describe('when the Employee holds Jobs with more than 25 active Tasks between them', () => {
		function twoFullJobs() {
			const payMe = createTestPayMe();
			const courier = job(payMe, 'Courier');
			const miner = job(payMe, 'Miner');
			for (let i = 10; i < 30; i++) {
				task(payMe, `Courier Task ${i}`, courier.id);
				task(payMe, `Miner Task ${i}`, miner.id);
			}
			const outside = task(payMe, 'Stack Crates', job(payMe, 'Logistics').id);
			hire(payMe, 'user-alex');
			return { payMe, miner, outside, alex: member('user-alex', 'role-courier', 'role-miner') };
		}

		it('asks them to pick a Job', () => {
			const { payMe, alex } = twoFullJobs();

			expect(requestForm(payMe, alex)).toEqual({ ok: false, error: { code: 'pick-a-job' } });
		});

		it("offers only the picked Job's active Tasks", () => {
			const { payMe, miner, alex } = twoFullJobs();

			const form = created(requestForm(payMe, alex, miner.id));

			expect(form).toHaveLength(20);
			expect(form.every((offered) => offered.name.startsWith('Miner Task'))).toBe(true);
		});

		it('refuses a Job they do not hold', () => {
			const { payMe, alex } = twoFullJobs();
			const warehouse = job(payMe, 'Warehouse');

			expect(requestForm(payMe, alex, warehouse.id)).toEqual({ ok: false, error: { code: 'job-not-held' } });
		});

		it('accepts any active Task of their Jobs on submission, and no other', () => {
			const { payMe, miner, outside, alex } = twoFullJobs();
			const minerTask = created(requestForm(payMe, alex, miner.id))[19];
			const evidence = { notes: 'Done', link: null, files: [screenshot] };

			expect(submitRequest(payMe, alex, { taskId: minerTask.id, ...evidence })).toMatchObject({ ok: true, value: { taskId: minerTask.id } });
			expect(submitRequest(payMe, alex, { taskId: outside.id, ...evidence })).toEqual({ ok: false, error: { code: 'task-not-offered' } });
		});
	});

	it("offers only a picked Job's Tasks when the Employee has 25 or fewer in total", () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const logistics = job(payMe, 'Logistics');
		task(payMe, 'Deliver Parcel', courier.id);
		task(payMe, 'Stack Crates', logistics.id);
		hire(payMe, 'user-alex');

		const form = created(requestForm(payMe, member('user-alex', 'role-courier', 'role-logistics'), logistics.id));

		expect(form.map((offered) => offered.name)).toEqual(['Stack Crates']);
	});

	it('tells an Employee whose Jobs have no active Tasks that there is nothing to request', () => {
		const payMe = createTestPayMe();
		job(payMe, 'Courier');
		hire(payMe, 'user-alex');

		expect(requestForm(payMe, member('user-alex', 'role-courier'))).toEqual({ ok: false, error: { code: 'no-tasks' } });
	});
});

describe('Submitting a Payment Request', () => {
	it('numbers the request R-n and records it as Pending with its Evidence and history', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const parcel = task(payMe, 'Deliver Parcel', courier.id);
		hire(payMe, 'user-alex');
		const alex = member('user-alex', 'role-courier');

		const first = created(submitRequest(payMe, alex, { taskId: parcel.id, notes: 'Took it to spawn', link: null, files: [screenshot] }));
		const second = created(submitRequest(payMe, alex, { taskId: parcel.id, notes: 'Again', link: 'https://example.com/proof', files: [] }));

		expect([first.number, second.number]).toEqual([1, 2]);
		expect(getPaymentRequest(payMe, 1)).toMatchObject({
			number: 1,
			employeeUserId: 'user-alex',
			taskId: parcel.id,
			state: 'pending',
			round: 1,
			eligibleJobIds: [courier.id],
			evidence: [
				{ round: 1, kind: 'notes', text: 'Took it to spawn' },
				{ round: 1, kind: 'attachment', name: 'proof.png', url: 'https://cdn.example/proof.png' }
			],
			history: [{ from: null, to: 'pending', actorUserId: 'user-alex', reason: null }],
			messages: []
		});
		expect(getPaymentRequest(payMe, 2)?.evidence).toEqual([
			{ round: 1, kind: 'notes', text: 'Again' },
			{ round: 1, kind: 'link', url: 'https://example.com/proof' }
		]);
	});

	it('posts the request with its Evidence to the Requests Thread, then a review copy to each eligible Review Channel', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const logistics = job(payMe, 'Logistics');
		const cart = task(payMe, 'Load Cart', courier.id, logistics.id);
		hire(payMe, 'user-alex');
		const files = [screenshot, { name: 'map.jpg', url: 'https://cdn.example/map.jpg' }];

		const outcome = submitRequest(payMe, member('user-alex', 'role-courier', 'role-logistics'), {
			taskId: cart.id,
			notes: 'Loaded 64 crates',
			link: 'https://example.com/proof',
			files
		});

		const evidence = 'Notes: Loaded 64 crates\nLink: https://example.com/proof';
		const review = (jobId: number, channelId: string) => ({
			type: 'post-review-message',
			requestNumber: 1,
			round: 1,
			jobId,
			channelId,
			content: `**R-1** Load Cart from <@user-alex> (Alex_42)\n${evidence}`,
			files
		});
		expect(outcome.ok && outcome.effects).toEqual([
			{
				type: 'post-request-entry',
				requestNumber: 1,
				round: 1,
				employeeUserId: 'user-alex',
				content: `**R-1** Load Cart\nSubmitted by <@user-alex>, Pending review.\n${evidence}`,
				files,
				actions: ['withdraw']
			},
			review(courier.id, 'review-courier'),
			review(logistics.id, 'review-logistics'),
			{ type: 'private-reply', content: 'Submitted R-1 for Load Cart.' }
		]);
	});

	it('records the Requests Thread entry and each review copy once Discord has posted them', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		hire(payMe, 'user-alex');
		submit(payMe, member('user-alex', 'role-courier'), task(payMe, 'Deliver Parcel', courier.id).id);

		recordRequestMessage(payMe, 1, { round: 1, jobId: null, channelId: 'thread-user-alex', messageId: 'message-entry' });
		recordRequestMessage(payMe, 1, { round: 1, jobId: courier.id, channelId: 'review-courier', messageId: 'message-review' });

		expect(getPaymentRequest(payMe, 1)?.messages).toEqual([
			{ round: 1, jobId: null, channelId: 'thread-user-alex', messageId: 'message-entry' },
			{ round: 1, jobId: courier.id, channelId: 'review-courier', messageId: 'message-review' }
		]);
		expect(requestEntry(payMe, 1, 1)).toEqual({ round: 1, jobId: null, channelId: 'thread-user-alex', messageId: 'message-entry' });
	});

	it("refuses until the Employee's Requests Thread exists", () => {
		const payMe = createTestPayMe();
		const parcel = task(payMe, 'Deliver Parcel', job(payMe, 'Courier').id);
		created(hireEmployee(payMe, leadership(), member('user-alex'), 'Alex_42'));

		expect(requestForm(payMe, member('user-alex', 'role-courier'))).toEqual({ ok: false, error: { code: 'no-requests-thread' } });
		expect(
			submitRequest(payMe, member('user-alex', 'role-courier'), { taskId: parcel.id, notes: 'Done', link: null, files: [screenshot] })
		).toEqual({
			ok: false,
			error: { code: 'no-requests-thread' }
		});
	});

	it('fixes the eligible Jobs at submission: the Jobs the Task belongs to that the Employee holds', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const logistics = job(payMe, 'Logistics');
		const miner = job(payMe, 'Miner');
		const cart = task(payMe, 'Load Cart', courier.id, logistics.id, miner.id);
		hire(payMe, 'user-alex');

		submit(payMe, member('user-alex', 'role-courier', 'role-miner'), cart.id);
		addTaskToJob(payMe, leadership(), cart.id, job(payMe, 'Farmer').id);
		submit(payMe, member('user-alex', 'role-logistics', 'role-farmer'), cart.id);

		expect(getPaymentRequest(payMe, 1)?.eligibleJobIds).toEqual([courier.id, miner.id]);
	});

	it('refuses a submission with neither a link nor a file', () => {
		const payMe = createTestPayMe();
		const parcel = task(payMe, 'Deliver Parcel', job(payMe, 'Courier').id);
		hire(payMe, 'user-alex');

		expect(submitRequest(payMe, member('user-alex', 'role-courier'), { taskId: parcel.id, notes: 'Trust me', link: null, files: [] })).toEqual({
			ok: false,
			error: { code: 'evidence-required' }
		});
		expect(getPaymentRequest(payMe, 1)).toBeNull();
	});

	it('refuses blank notes and a link that is not a web address', () => {
		const payMe = createTestPayMe();
		const parcel = task(payMe, 'Deliver Parcel', job(payMe, 'Courier').id);
		hire(payMe, 'user-alex');
		const alex = member('user-alex', 'role-courier');

		expect(submitRequest(payMe, alex, { taskId: parcel.id, notes: '  ', link: null, files: [screenshot] })).toEqual({
			ok: false,
			error: { code: 'notes-required' }
		});
		expect(submitRequest(payMe, alex, { taskId: parcel.id, notes: 'Done', link: 'javascript:alert(1)', files: [] })).toEqual({
			ok: false,
			error: { code: 'invalid-link', link: 'javascript:alert(1)' }
		});
	});

	it('refuses Tasks the Employee was not offered: retired, or outside their current Jobs', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const ore = task(payMe, 'Mine Ore', job(payMe, 'Miner').id);
		const oldRoute = task(payMe, 'Old Route', courier.id);
		retireTask(payMe, leadership(), oldRoute.id);
		hire(payMe, 'user-alex');
		const alex = member('user-alex', 'role-courier');

		for (const taskId of [ore.id, oldRoute.id, 999]) {
			expect(submitRequest(payMe, alex, { taskId, notes: 'Done', link: null, files: [screenshot] })).toEqual({
				ok: false,
				error: { code: 'task-not-offered' }
			});
		}
	});

	it('refuses members who have not been hired and Employees with no Jobs', () => {
		const payMe = createTestPayMe();
		const parcel = task(payMe, 'Deliver Parcel', job(payMe, 'Courier').id);
		hire(payMe, 'user-alex');
		const input = { taskId: parcel.id, notes: 'Done', link: null, files: [screenshot] };

		expect(submitRequest(payMe, member('user-sam', 'role-courier'), input)).toEqual({ ok: false, error: { code: 'not-hired' } });
		expect(submitRequest(payMe, member('user-alex'), input)).toEqual({ ok: false, error: { code: 'no-jobs' } });
	});
});
