import { describe, expect, it } from 'vitest';
import {
	addManagerRole,
	addTask,
	approveRequest,
	changeRate,
	createJob,
	denyRequest,
	estimateOwed,
	hireEmployee,
	myRequests,
	recordRequestsThread,
	rejectRequest,
	retireTask,
	submitRequest,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const screenshot = { name: 'proof.png', url: 'https://cdn.example/proof.png' };
const alex = member('user-alex', 'role-courier');
const courierManager = member('user-casey', 'role-courier-manager');

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

/** Alex, a Courier, can request Deliver Parcel (12.5) and Sort Mail (3). */
function courierAlex() {
	const payMe = createTestPayMe();
	const courier = created(createJob(payMe, leadership(), { name: 'Courier', employeeRoleId: 'role-courier', reviewChannelId: 'review-courier' }));
	addManagerRole(payMe, leadership(), courier.id, 'role-courier-manager', []);
	const parcel = created(addTask(payMe, leadership(), { name: 'Deliver Parcel', rate: '12.5', jobIds: [courier.id] }));
	const mail = created(addTask(payMe, leadership(), { name: 'Sort Mail', rate: '3', jobIds: [courier.id] }));
	created(hireEmployee(payMe, leadership(), member('user-alex'), 'Alex_42'));
	recordRequestsThread(payMe, 'user-alex', { channelId: 'channel-alex', pinnedMessageId: 'pin-alex', threadId: 'thread-alex' });
	return { payMe, parcel, mail };
}

function submit(payMe: PayMe, taskId: number) {
	return created(submitRequest(payMe, alex, { taskId, notes: 'Done', link: null, files: [screenshot] })).number;
}

describe('Estimated amount owed', () => {
	it('adds up the current Rates of the Employee’s Approved requests only', () => {
		const { payMe, parcel, mail } = courierAlex();
		created(approveRequest(payMe, courierManager, submit(payMe, parcel.id)));
		created(approveRequest(payMe, courierManager, submit(payMe, parcel.id)));
		created(approveRequest(payMe, courierManager, submit(payMe, mail.id)));
		submit(payMe, mail.id);

		expect(estimateOwed(payMe, 'user-alex')).toBe(2800);
	});

	it('follows a Rate change made after approval', () => {
		const { payMe, parcel } = courierAlex();
		created(approveRequest(payMe, courierManager, submit(payMe, parcel.id)));
		created(changeRate(payMe, leadership(), parcel.id, '20.25'));

		expect(estimateOwed(payMe, 'user-alex')).toBe(2025);
	});

	it('keeps the last Rate of a Retired Task', () => {
		const { payMe, parcel } = courierAlex();
		created(approveRequest(payMe, courierManager, submit(payMe, parcel.id)));
		created(retireTask(payMe, leadership(), parcel.id));

		expect(estimateOwed(payMe, 'user-alex')).toBe(1250);
	});

	it('is zero for an Employee with nothing Approved', () => {
		const { payMe, parcel } = courierAlex();
		submit(payMe, parcel.id);

		expect(estimateOwed(payMe, 'user-alex')).toBe(0);
	});
});

describe('/requests', () => {
	it('privately lists the Employee’s Pending, Rejected and Approved requests with an estimate of what they are owed', () => {
		const { payMe, parcel, mail } = courierAlex();
		const approved = submit(payMe, parcel.id);
		created(approveRequest(payMe, courierManager, approved));
		const rejected = submit(payMe, mail.id);
		created(rejectRequest(payMe, courierManager, rejected, 'Blurry'));
		const denied = submit(payMe, mail.id);
		created(denyRequest(payMe, courierManager, denied, 'Duplicate'));
		submit(payMe, mail.id);

		const outcome = myRequests(payMe, alex);

		expect(outcome).toMatchObject({
			ok: true,
			value: {
				requests: [
					{ number: 1, state: 'approved' },
					{ number: 2, state: 'rejected' },
					{ number: 4, state: 'pending' }
				],
				estimatedOwed: 1250
			},
			effects: [
				{
					type: 'private-reply',
					content: [
						'**R-1** Deliver Parcel: Approved',
						'**R-2** Sort Mail: Rejected',
						'**R-4** Sort Mail: Pending',
						'',
						'Estimated amount owed: **12.5** (an estimate at current Rates; the Rate when your Payout is generated applies)'
					].join('\n')
				}
			]
		});
	});

	it('uses the new Rate after a Rate change', () => {
		const { payMe, parcel } = courierAlex();
		created(approveRequest(payMe, courierManager, submit(payMe, parcel.id)));
		created(changeRate(payMe, leadership(), parcel.id, '15'));

		expect(myRequests(payMe, alex)).toMatchObject({ ok: true, value: { estimatedOwed: 1500 } });
	});

	it('says so when the Employee has no open requests', () => {
		const { payMe } = courierAlex();

		expect(myRequests(payMe, alex)).toMatchObject({
			ok: true,
			value: { requests: [], estimatedOwed: 0 },
			effects: [{ type: 'private-reply', content: 'You have no open Payment Requests.' }]
		});
	});

	it('tells a member who has not been hired to ask Leadership', () => {
		const { payMe } = courierAlex();

		expect(myRequests(payMe, member('user-sam', 'role-courier'))).toEqual({ ok: false, error: { code: 'not-hired' } });
	});
});
