import { describe, expect, it } from 'vitest';
import {
	addManagerRole,
	addTask,
	approveRequest,
	checkReviewer,
	createJob,
	denyRequest,
	getPaymentRequest,
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
		expect(getPaymentRequest(payMe, 1)?.history).toMatchObject([
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
		expect(getPaymentRequest(payMe, 1)?.history[1]).toMatchObject({
			from: 'pending',
			to: 'rejected',
			actorUserId: 'user-casey',
			reason: 'Blurry screenshot'
		});
		expect(getPaymentRequest(payMe, 2)?.history[1]).toMatchObject({
			from: 'pending',
			to: 'denied',
			actorUserId: 'user-casey',
			reason: 'Duplicate of R-1'
		});
	});

	it('requires a reason', () => {
		const { payMe } = pendingParcel();

		expect(rejectRequest(payMe, courierManager, 1, '  ')).toEqual({ ok: false, error: { code: 'reason-required' } });
		expect(denyRequest(payMe, courierManager, 1, '')).toEqual({ ok: false, error: { code: 'reason-required' } });
		expect(getPaymentRequest(payMe, 1)?.state).toBe('pending');
	});

	it('refuses to decide a request that is no longer Pending', () => {
		const { payMe } = pendingParcel();
		created(rejectRequest(payMe, courierManager, 1, 'Blurry'));

		expect(approveRequest(payMe, leadership(), 1)).toEqual({ ok: false, error: { code: 'already-decided', number: 1, state: 'rejected' } });
		expect(denyRequest(payMe, leadership(), 1, 'No')).toEqual({ ok: false, error: { code: 'already-decided', number: 1, state: 'rejected' } });
		expect(getPaymentRequest(payMe, 1)?.history.map((entry) => entry.to)).toEqual(['pending', 'rejected']);
	});
});

describe('What a decision posts', () => {
	const copy = '**R-1** Deliver Parcel from <@user-alex> (Alex_42)\nNotes: Done';

	it('updates every review copy with the outcome and reviewer, and logs an approval without pinging the Employee', () => {
		const { payMe } = pendingParcel();

		expect(approveRequest(payMe, courierManager, 1)).toMatchObject({
			effects: [
				{ type: 'update-review-copies', requestNumber: 1, round: 1, content: `${copy}\n**Approved** by <@user-casey>` },
				{
					type: 'post-to-requests-thread',
					employeeUserId: 'user-alex',
					content: '**R-1** Deliver Parcel: **Approved** by <@user-casey>',
					ping: false
				},
				{ type: 'private-reply', content: 'Approved R-1.' }
			]
		});
	});

	it('pings the Employee with the reason when their request is Rejected or Denied', () => {
		const { payMe } = pendingParcel();
		created(submitRequest(payMe, member('user-alex', 'role-courier'), { taskId: 1, notes: 'Done', link: null, files: [screenshot] }));

		expect(rejectRequest(payMe, courierManager, 1, 'Blurry screenshot')).toMatchObject({
			effects: [
				{ type: 'update-review-copies', content: `${copy}\n**Rejected** by <@user-casey>: Blurry screenshot` },
				{ type: 'post-to-requests-thread', content: '**R-1** Deliver Parcel: **Rejected** by <@user-casey>: Blurry screenshot', ping: true },
				{ type: 'private-reply', content: 'Rejected R-1.' }
			]
		});
		expect(denyRequest(payMe, courierManager, 2, 'Duplicate')).toMatchObject({
			effects: [
				{ type: 'update-review-copies', requestNumber: 2 },
				{ type: 'post-to-requests-thread', content: '**R-2** Deliver Parcel: **Denied** by <@user-casey>: Duplicate', ping: true },
				{ type: 'private-reply', content: 'Denied R-2.' }
			]
		});
	});
});

describe('Who can review', () => {
	it('lets Leadership review a request for any Job', () => {
		const { payMe } = pendingParcel();

		expect(approveRequest(payMe, leadership(), 1)).toMatchObject({ ok: true });
	});

	it('refuses a Manager of a Job that is not eligible for the request, and members who manage nothing', () => {
		const { payMe } = pendingParcel();
		job(payMe, 'Logistics');

		for (const reviewer of [member('user-lee', 'role-logistics-manager'), member('user-sam', 'role-courier')]) {
			expect(approveRequest(payMe, reviewer, 1)).toEqual({ ok: false, error: { code: 'not-a-reviewer' } });
		}
		expect(getPaymentRequest(payMe, 1)?.state).toBe('pending');
	});

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

	it('stops anyone reviewing their own request, including Leadership', () => {
		const { payMe } = pendingParcel();
		const alexAsReviewer = member('user-alex', 'role-courier', 'role-courier-manager', 'role-leadership');

		expect(approveRequest(payMe, alexAsReviewer, 1)).toEqual({ ok: false, error: { code: 'own-request' } });
		expect(getPaymentRequest(payMe, 1)?.state).toBe('pending');
	});

	it('tells the reviewer when the request does not exist', () => {
		const { payMe } = pendingParcel();

		expect(approveRequest(payMe, leadership(), 99)).toEqual({ ok: false, error: { code: 'request-not-found' } });
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
		expect(getPaymentRequest(payMe, 1)?.history.map((entry) => entry.to)).toEqual(['pending', 'approved']);
	});

	it('tell a Manager whose reason form was open while another Manager approved that the request was already decided', () => {
		const { payMe } = pendingParcel();

		expect(checkReviewer(payMe, courierManager, 1)).toMatchObject({ ok: true });
		created(approveRequest(payMe, leadership(), 1));

		expect(rejectRequest(payMe, courierManager, 1, 'Blurry')).toEqual({
			ok: false,
			error: { code: 'already-decided', number: 1, state: 'approved' }
		});
		expect(getPaymentRequest(payMe, 1)?.history.map((entry) => entry.to)).toEqual(['pending', 'approved']);
	});
});
