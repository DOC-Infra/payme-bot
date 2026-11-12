import { describe, expect, it } from 'vitest';
import {
	addManagerRole,
	addTask,
	amendRequest,
	approveRequest,
	createJob,
	denyRequest,
	hireEmployee,
	recordRequestsThread,
	rejectRequest,
	submitRequest,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const screenshot = { name: 'proof.png', url: 'https://cdn.example/proof.png' };
const courierManager = member('user-casey', 'role-courier-manager');

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

function hire(payMe: PayMe, userId: string, minecraftName: string) {
	created(hireEmployee(payMe, leadership(), member(userId), minecraftName));
	recordRequestsThread(payMe, userId, { channelId: `channel-${userId}`, pinnedMessageId: `pin-${userId}`, threadId: `thread-${userId}` });
}

/** Alex, a Courier, submits R-1 for Deliver Parcel. */
function pendingParcel() {
	const payMe = createTestPayMe();
	const courier = job(payMe, 'Courier');
	const parcel = created(addTask(payMe, leadership(), { name: 'Deliver Parcel', rate: '100', jobIds: [courier.id] }));
	hire(payMe, 'user-alex', 'Alex_42');
	created(submitRequest(payMe, member('user-alex', 'role-courier'), { taskId: parcel.id, notes: 'Done', link: null, files: [screenshot] }));
	return { payMe, courier };
}

describe('Approving a Payment Request', () => {
	it('moves a Pending request to Approved and records who approved it', () => {
		const { payMe } = pendingParcel();

		expect(approveRequest(payMe, courierManager, 1)).toMatchObject({ ok: true, value: { state: 'approved' } });
		expect(payMe.requests.load(1)?.history).toMatchObject([
			{ from: null, to: 'pending', actorUserId: 'user-alex', reason: null },
			{ from: 'pending', to: 'approved', actorUserId: 'user-casey', reason: null }
		]);
	});
});

describe('Rejecting and denying a Payment Request', () => {
	it('moves a Pending request to Rejected or Denied and records the reason', () => {
		const { payMe } = pendingParcel();
		created(submitRequest(payMe, member('user-alex', 'role-courier'), { taskId: 1, notes: 'Again', link: null, files: [screenshot] }));

		expect(rejectRequest(payMe, courierManager, 1, ' Blurry screenshot ')).toMatchObject({ ok: true, value: { state: 'rejected' } });
		expect(denyRequest(payMe, courierManager, 2, 'Duplicate of R-1')).toMatchObject({ ok: true, value: { state: 'denied' } });
		expect(payMe.requests.load(1)?.history[1]).toMatchObject({
			from: 'pending',
			to: 'rejected',
			actorUserId: 'user-casey',
			reason: 'Blurry screenshot'
		});
		expect(payMe.requests.load(2)?.history[1]).toMatchObject({
			from: 'pending',
			to: 'denied',
			actorUserId: 'user-casey',
			reason: 'Duplicate of R-1'
		});
	});
});

describe('What a decision posts', () => {
	const copy = (tone: string, status: string) => ({
		tone,
		title: 'R-1 · Deliver Parcel',
		description: 'From <@user-alex> (Alex_42)',
		fields: [
			{ name: 'Notes', value: 'Done' },
			{ name: 'Status', value: status }
		]
	});

	it('updates every review copy with the outcome and reviewer, removes the Withdraw button, and logs an approval without pinging the Employee', () => {
		const { payMe } = pendingParcel();

		expect(approveRequest(payMe, courierManager, 1)).toMatchObject({
			effects: [
				{ type: 'update-review-copies', requestNumber: 1, round: 1, card: copy('success', '**Approved** by <@user-casey>') },
				{ type: 'update-entry-actions', requestNumber: 1, round: 1, actions: [] },
				{
					type: 'post-to-requests-thread',
					employeeUserId: 'user-alex',
					card: { tone: 'success', title: 'R-1 · Deliver Parcel', description: '**Approved** by <@user-casey>' },
					ping: false
				}
			]
		});
	});

	it('pings the Employee with the reason when their request is Rejected or Denied, and offers Amend only when Rejected', () => {
		const { payMe } = pendingParcel();
		created(submitRequest(payMe, member('user-alex', 'role-courier'), { taskId: 1, notes: 'Done', link: null, files: [screenshot] }));

		expect(rejectRequest(payMe, courierManager, 1, 'Blurry screenshot')).toMatchObject({
			effects: [
				{ type: 'update-review-copies', card: copy('warning', '**Rejected** by <@user-casey>: Blurry screenshot') },
				{ type: 'update-entry-actions', requestNumber: 1, actions: ['amend', 'withdraw'] },
				{
					type: 'post-to-requests-thread',
					card: { tone: 'warning', title: 'R-1 · Deliver Parcel', description: '**Rejected** by <@user-casey>: Blurry screenshot' },
					ping: true
				}
			]
		});
		expect(denyRequest(payMe, courierManager, 2, 'Duplicate')).toMatchObject({
			effects: [
				{ type: 'update-review-copies', requestNumber: 2 },
				{ type: 'update-entry-actions', requestNumber: 2, actions: [] },
				{
					type: 'post-to-requests-thread',
					card: { tone: 'danger', title: 'R-2 · Deliver Parcel', description: '**Denied** by <@user-casey>: Duplicate' },
					ping: true
				}
			]
		});
	});
});

describe('Which review copies a decision changes', () => {
	const copy = (round: number, jobId: number | null, channelId: string) => ({
		round,
		jobId,
		channelId,
		messageId: `message-${channelId}-${round}`
	});

	/** R-1 for Load Cart, eligible under Courier and Logistics, with its round 1 entry and both review copies posted. */
	function postedCart() {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const logistics = job(payMe, 'Logistics');
		const cart = created(addTask(payMe, leadership(), { name: 'Load Cart', rate: '100', jobIds: [courier.id, logistics.id] }));
		hire(payMe, 'user-alex', 'Alex_42');
		const alex = member('user-alex', 'role-courier', 'role-logistics');
		created(submitRequest(payMe, alex, { taskId: cart.id, notes: 'Done', link: null, files: [screenshot] }));
		for (const message of [copy(1, null, 'thread-user-alex'), copy(1, courier.id, 'review-courier'), copy(1, logistics.id, 'review-logistics')])
			payMe.requests.recordMessage(1, message);
		return { payMe, courier, logistics, alex };
	}

	it.each([
		['approves', (payMe: PayMe) => approveRequest(payMe, courierManager, 1)],
		['rejects', (payMe: PayMe) => rejectRequest(payMe, courierManager, 1, 'Blurry')],
		['denies', (payMe: PayMe) => denyRequest(payMe, courierManager, 1, 'Duplicate')]
	])('edits every review copy of the round when a Manager %s, but not the Requests Thread entry', (_, decide) => {
		const { payMe } = postedCart();

		expect(decide(payMe)).toMatchObject({
			effects: expect.arrayContaining([
				expect.objectContaining({
					type: 'update-review-copies',
					messages: [
						{ channelId: 'review-courier', messageId: 'message-review-courier-1' },
						{ channelId: 'review-logistics', messageId: 'message-review-logistics-1' }
					]
				})
			])
		});
	});

	it('leaves the review copies of earlier rounds alone when deciding a resubmission', () => {
		const { payMe, courier, logistics, alex } = postedCart();
		created(rejectRequest(payMe, courierManager, 1, 'Blurry'));
		created(amendRequest(payMe, alex, 1, { notes: 'Retook it', link: null, files: [] }));
		for (const message of [copy(2, null, 'thread-user-alex'), copy(2, courier.id, 'review-courier'), copy(2, logistics.id, 'review-logistics')])
			payMe.requests.recordMessage(1, message);

		expect(approveRequest(payMe, courierManager, 1)).toMatchObject({
			effects: expect.arrayContaining([
				expect.objectContaining({
					type: 'update-review-copies',
					round: 2,
					messages: [
						{ channelId: 'review-courier', messageId: 'message-review-courier-2' },
						{ channelId: 'review-logistics', messageId: 'message-review-logistics-2' }
					]
				})
			])
		});
	});
});

describe('Who can review', () => {
	it('lets a Manager of any eligible Job review a request for a shared Task', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const logistics = job(payMe, 'Logistics');
		const cart = created(addTask(payMe, leadership(), { name: 'Load Cart', rate: '100', jobIds: [courier.id, logistics.id] }));
		hire(payMe, 'user-alex', 'Alex_42');
		created(
			submitRequest(payMe, member('user-alex', 'role-courier', 'role-logistics'), {
				taskId: cart.id,
				notes: 'Done',
				link: null,
				files: [screenshot]
			})
		);

		expect(approveRequest(payMe, member('user-lee', 'role-logistics-manager'), 1)).toMatchObject({ ok: true });
	});
});

describe('Two simultaneous decisions', () => {
	it('produce exactly one state change, and the second Manager is told the request was already decided', async () => {
		const { payMe } = pendingParcel();
		const otherManager = member('user-drew', 'role-courier-manager');

		const [first, second] = await Promise.all([
			Promise.resolve().then(() => approveRequest(payMe, courierManager, 1)),
			Promise.resolve().then(() => approveRequest(payMe, otherManager, 1))
		]);

		expect(first).toMatchObject({ ok: true });
		expect(second).toEqual({ ok: false, error: { code: 'already-decided', number: 1, state: 'approved' } });
		expect(payMe.requests.load(1)?.history.map((entry) => entry.to)).toEqual(['pending', 'approved']);
	});
});
