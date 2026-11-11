import { describe, expect, it } from 'vitest';
import {
	addManagerRole,
	addTask,
	amendRequest,
	approveRequest,
	checkAmend,
	checkWithdraw,
	createJob,
	denyRequest,
	getPaymentRequest,
	hireEmployee,
	recordRequestsThread,
	rejectRequest,
	submitRequest,
	withdrawRequest,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const screenshot = { name: 'proof.png', url: 'https://cdn.example/proof.png' };
const clearer = { name: 'clearer.png', url: 'https://cdn.example/clearer.png' };
const alex = member('user-alex', 'role-courier');
const courierManager = member('user-casey', 'role-courier-manager');
const more = { notes: 'Retook it', link: null, files: [clearer] };

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

/** Alex, a Courier, submits R-1 for Deliver Parcel. */
function pendingParcel() {
	const payMe = createTestPayMe();
	const courier = job(payMe, 'Courier');
	const parcel = created(addTask(payMe, leadership(), { name: 'Deliver Parcel', rate: '100', jobIds: [courier.id] }));
	created(hireEmployee(payMe, leadership(), member('user-alex'), 'Alex_42'));
	recordRequestsThread(payMe, 'user-alex', { channelId: 'channel-alex', pinnedMessageId: 'pin-alex', threadId: 'thread-alex' });
	created(submitRequest(payMe, alex, { taskId: parcel.id, notes: 'Done', link: null, files: [screenshot] }));
	return { payMe, courier };
}

function rejectedParcel() {
	const scenario = pendingParcel();
	created(rejectRequest(scenario.payMe, courierManager, 1, 'Blurry screenshot'));
	return scenario;
}

describe('Amending a Rejected Payment Request', () => {
	it('returns it to Pending in a new round, keeping the original Evidence and adding the new', () => {
		const { payMe } = rejectedParcel();

		const outcome = amendRequest(payMe, alex, 1, { notes: ' Retook it ', link: 'https://example.com/more', files: [clearer] });

		expect(outcome).toMatchObject({ ok: true, value: { state: 'pending', round: 2 } });
		expect(getPaymentRequest(payMe, 1)?.evidence).toEqual([
			{ round: 1, kind: 'notes', text: 'Done' },
			{ round: 1, kind: 'attachment', ...screenshot },
			{ round: 2, kind: 'notes', text: 'Retook it' },
			{ round: 2, kind: 'link', url: 'https://example.com/more' },
			{ round: 2, kind: 'attachment', ...clearer }
		]);
		expect(getPaymentRequest(payMe, 1)?.history.at(-1)).toMatchObject({
			from: 'rejected',
			to: 'pending',
			actorUserId: 'user-alex',
			reason: null
		});
	});

	it('lets only the requesting Employee amend, not Managers or Leadership', () => {
		const { payMe } = rejectedParcel();

		for (const other of [courierManager, leadership(), member('user-sam', 'role-courier')]) {
			expect(amendRequest(payMe, other, 1, more)).toEqual({ ok: false, error: { code: 'not-your-request' } });
		}
		expect(getPaymentRequest(payMe, 1)?.state).toBe('rejected');
	});

	it('refuses a request that is not Rejected, including Denied ones', () => {
		const { payMe } = pendingParcel();
		created(submitRequest(payMe, alex, { taskId: 1, notes: 'Again', link: null, files: [screenshot] }));
		created(denyRequest(payMe, courierManager, 2, 'Duplicate'));

		expect(amendRequest(payMe, alex, 1, more)).toEqual({ ok: false, error: { code: 'cannot-amend', number: 1, state: 'pending' } });
		expect(amendRequest(payMe, alex, 2, more)).toEqual({ ok: false, error: { code: 'cannot-amend', number: 2, state: 'denied' } });
		expect(amendRequest(payMe, alex, 99, more)).toEqual({ ok: false, error: { code: 'request-not-found' } });
		expect(getPaymentRequest(payMe, 2)?.round).toBe(1);
	});

	it('needs notes and a valid link', () => {
		const { payMe } = rejectedParcel();

		expect(amendRequest(payMe, alex, 1, { notes: ' ', link: null, files: [clearer] })).toEqual({ ok: false, error: { code: 'notes-required' } });
		expect(amendRequest(payMe, alex, 1, { notes: 'More', link: 'nope', files: [] })).toEqual({
			ok: false,
			error: { code: 'invalid-link', link: 'nope' }
		});
	});
});

describe('What resubmitting posts', () => {
	it('posts the added Evidence as a new entry in the Requests Thread and a new review copy in each eligible Review Channel', () => {
		const { payMe, courier } = rejectedParcel();

		const outcome = amendRequest(payMe, alex, 1, { notes: 'Retook it', link: 'https://example.com/more', files: [clearer] });

		const evidence = 'Notes: Retook it\nLink: https://example.com/more';
		expect(outcome.ok && outcome.effects).toEqual([
			{ type: 'update-entry-actions', requestNumber: 1, round: 1, actions: [] },
			{
				type: 'post-request-entry',
				requestNumber: 1,
				round: 2,
				employeeUserId: 'user-alex',
				content: `**R-1** Deliver Parcel\nAmended and resubmitted by <@user-alex>, Pending review.\n${evidence}`,
				files: [clearer],
				actions: ['withdraw']
			},
			{
				type: 'post-review-message',
				requestNumber: 1,
				round: 2,
				jobId: courier.id,
				channelId: 'review-courier',
				content: `**R-1** Deliver Parcel from <@user-alex> (Alex_42), resubmitted\n${evidence}`,
				files: [clearer]
			},
			{ type: 'private-reply', content: 'Resubmitted R-1.' }
		]);
	});
});

describe('Withdrawing a Payment Request', () => {
	it('moves a Pending request to Withdrawn, closes its review copies and logs it without pinging', () => {
		const { payMe } = pendingParcel();

		expect(withdrawRequest(payMe, alex, 1)).toEqual({
			ok: true,
			value: getPaymentRequest(payMe, 1),
			effects: [
				{
					type: 'update-review-copies',
					requestNumber: 1,
					round: 1,
					content: '**R-1** Deliver Parcel from <@user-alex> (Alex_42)\nNotes: Done\n**Withdrawn** by <@user-alex>'
				},
				{ type: 'update-entry-actions', requestNumber: 1, round: 1, actions: [] },
				{
					type: 'post-to-requests-thread',
					employeeUserId: 'user-alex',
					content: '**R-1** Deliver Parcel: **Withdrawn** by <@user-alex>',
					ping: false
				},
				{ type: 'private-reply', content: 'Withdrew R-1.' }
			]
		});
		expect(getPaymentRequest(payMe, 1)?.history.at(-1)).toMatchObject({ from: 'pending', to: 'withdrawn', actorUserId: 'user-alex' });
	});

	it('withdraws a Rejected request, which can then never be amended or withdrawn again', () => {
		const { payMe } = rejectedParcel();

		expect(withdrawRequest(payMe, alex, 1)).toMatchObject({ ok: true, value: { state: 'withdrawn' } });
		expect(amendRequest(payMe, alex, 1, more)).toEqual({ ok: false, error: { code: 'cannot-amend', number: 1, state: 'withdrawn' } });
		expect(withdrawRequest(payMe, alex, 1)).toEqual({ ok: false, error: { code: 'cannot-withdraw', number: 1, state: 'withdrawn' } });
	});

	it('refuses Approved and Denied requests', () => {
		const { payMe } = pendingParcel();
		created(submitRequest(payMe, alex, { taskId: 1, notes: 'Again', link: null, files: [screenshot] }));
		created(approveRequest(payMe, courierManager, 1));
		created(denyRequest(payMe, courierManager, 2, 'Duplicate'));

		expect(withdrawRequest(payMe, alex, 1)).toEqual({ ok: false, error: { code: 'cannot-withdraw', number: 1, state: 'approved' } });
		expect(withdrawRequest(payMe, alex, 2)).toEqual({ ok: false, error: { code: 'cannot-withdraw', number: 2, state: 'denied' } });
	});

	it('lets only the requesting Employee withdraw, not Managers or Leadership', () => {
		const { payMe } = pendingParcel();

		for (const other of [courierManager, leadership(), member('user-sam', 'role-courier')]) {
			expect(withdrawRequest(payMe, other, 1)).toEqual({ ok: false, error: { code: 'not-your-request' } });
		}
		expect(withdrawRequest(payMe, alex, 99)).toEqual({ ok: false, error: { code: 'request-not-found' } });
		expect(getPaymentRequest(payMe, 1)?.state).toBe('pending');
	});
});

describe('Asking the Employee to confirm', () => {
	it('checks the request can still be withdrawn or amended before asking, then refuses once a Manager has decided', () => {
		const { payMe } = rejectedParcel();

		expect(checkWithdraw(payMe, alex, 1)).toMatchObject({ ok: true, value: { number: 1 } });
		expect(checkAmend(payMe, alex, 1)).toMatchObject({ ok: true, value: { number: 1 } });
		expect(checkWithdraw(payMe, courierManager, 1)).toEqual({ ok: false, error: { code: 'not-your-request' } });

		created(amendRequest(payMe, alex, 1, more));
		created(approveRequest(payMe, courierManager, 1));

		expect(withdrawRequest(payMe, alex, 1)).toEqual({ ok: false, error: { code: 'cannot-withdraw', number: 1, state: 'approved' } });
	});
});
