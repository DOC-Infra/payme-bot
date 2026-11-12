import { describe, expect, it } from 'vitest';
import {
	addManagerRole,
	addTask,
	changeState,
	checkChange,
	createJob,
	entryActions,
	hireEmployee,
	submit,
	type Actor,
	type EntryAction,
	type Outcome,
	type PayMe,
	type RequestChange,
	type RequestState
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const alex = member('user-alex', 'role-courier');
const courierManager = member('user-casey', 'role-courier-manager');

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

/** A Courier Job with a Deliver Parcel Task, and Alex hired as an Employee. */
function courierPayMe() {
	const payMe = createTestPayMe();
	const courier = created(createJob(payMe, leadership(), { name: 'Courier', employeeRoleId: 'role-courier', reviewChannelId: 'review-courier' }));
	addManagerRole(payMe, leadership(), courier.id, 'role-courier-manager', []);
	const parcel = created(addTask(payMe, leadership(), { name: 'Deliver Parcel', rate: '100', jobIds: [courier.id] }));
	created(hireEmployee(payMe, leadership(), member('user-alex'), 'Alex_42'));
	return { payMe, courier, parcel };
}

function submitParcel(payMe: PayMe, by: Actor = alex) {
	return submit(payMe, by, { employeeUserId: 'user-alex', taskId: 1, eligibleJobIds: [1], evidence: [] });
}

describe('Submitting a Payment Request', () => {
	it('records it as Pending, with whoever filed it as the first history entry', () => {
		const { payMe } = courierPayMe();

		expect(submitParcel(payMe)).toMatchObject({
			number: 1,
			employeeUserId: 'user-alex',
			state: 'pending',
			history: [{ from: null, to: 'pending', actorUserId: 'user-alex', reason: null }]
		});
		expect(submitParcel(payMe, courierManager)).toMatchObject({
			employeeUserId: 'user-alex',
			history: [{ from: null, to: 'pending', actorUserId: 'user-casey' }]
		});
	});
});

/** Who makes each change when it is allowed: Alex owns the request, the Courier Manager reviews it and Leadership pays it. */
const actors: Record<RequestChange, Actor> = {
	approve: courierManager,
	reject: courierManager,
	deny: courierManager,
	amend: alex,
	withdraw: alex,
	pay: leadership()
};

const reasons: Record<RequestChange, string | null> = {
	approve: null,
	reject: 'Blurry screenshot',
	deny: 'Duplicate',
	amend: null,
	withdraw: null,
	pay: null
};

/** R-1, taken to `state` by the changes that lead there. */
function requestIn(state: RequestState) {
	const { payMe } = courierPayMe();
	submitParcel(payMe);
	const path: Record<RequestState, RequestChange[]> = {
		pending: [],
		approved: ['approve'],
		rejected: ['reject'],
		denied: ['deny'],
		withdrawn: ['withdraw'],
		paid: ['approve', 'pay']
	};
	for (const change of path[state]) created(changeState(payMe, actors[change], 1, change, reasons[change]));
	return payMe;
}

const states: RequestState[] = ['pending', 'approved', 'rejected', 'denied', 'withdrawn', 'paid'];

/** Where each change leads from the states it is allowed in. */
const allowed: Record<RequestChange, Partial<Record<RequestState, RequestState>>> = {
	approve: { pending: 'approved' },
	reject: { pending: 'rejected' },
	deny: { pending: 'denied' },
	amend: { rejected: 'pending' },
	withdraw: { pending: 'withdrawn', rejected: 'withdrawn' },
	pay: { approved: 'paid' }
};

const refusals = {
	approve: 'already-decided',
	reject: 'already-decided',
	deny: 'already-decided',
	amend: 'cannot-amend',
	withdraw: 'cannot-withdraw',
	pay: 'cannot-pay'
} as const;

const cases = states.flatMap((from) => (Object.keys(allowed) as RequestChange[]).map((change) => ({ from, change, to: allowed[change][from] })));

describe('Changing the state of a Payment Request', () => {
	it.each(cases.filter((entry) => entry.to))('$change moves a $from request to $to and records who did it and why', ({ from, change, to }) => {
		const payMe = requestIn(from);

		expect(changeState(payMe, actors[change], 1, change, reasons[change])).toMatchObject({ ok: true, value: { state: to } });
		expect(payMe.requests.load(1)?.history.at(-1)).toMatchObject({
			from,
			to,
			actorUserId: actors[change].userId,
			reason: reasons[change]
		});
	});

	it.each(cases.filter((entry) => !entry.to))('refuses to $change a $from request', ({ from, change }) => {
		const payMe = requestIn(from);

		expect(changeState(payMe, actors[change], 1, change, reasons[change])).toEqual({
			ok: false,
			error: { code: refusals[change], number: 1, state: from }
		});
		expect(payMe.requests.load(1)?.state).toBe(from);
	});
});

describe('The buttons on the Requests Thread entry', () => {
	const buttons: Record<RequestState, EntryAction[]> = {
		pending: ['withdraw'],
		approved: [],
		rejected: ['amend', 'withdraw'],
		denied: [],
		withdrawn: [],
		paid: []
	};

	it.each(states)('offer exactly the changes the Employee may make to a %s request', (state) => {
		const request = requestIn(state).requests.load(1)!;

		expect(entryActions(request)).toEqual(buttons[state]);
	});

	it('are gone from the entry of an earlier round once the request is resubmitted', () => {
		const payMe = requestIn('rejected');
		created(changeState(payMe, alex, 1, 'amend'));
		const request = { ...payMe.requests.load(1)!, round: 2 };

		expect(entryActions(request, 1)).toEqual([]);
		expect(entryActions(request, 2)).toEqual(['withdraw']);
	});
});

describe('Checking a change before asking for its form or confirmation', () => {
	it('applies the same rules without changing anything, and the change is refused if someone else got there first', () => {
		const payMe = requestIn('pending');

		expect(checkChange(payMe, courierManager, 1, 'reject')).toMatchObject({ ok: true, value: { number: 1, state: 'pending' } });
		expect(checkChange(payMe, alex, 1, 'withdraw')).toMatchObject({ ok: true, value: { state: 'pending' } });
		expect(checkChange(payMe, alex, 1, 'amend')).toEqual({ ok: false, error: { code: 'cannot-amend', number: 1, state: 'pending' } });
		expect(checkChange(payMe, courierManager, 1, 'withdraw')).toEqual({ ok: false, error: { code: 'not-your-request' } });
		expect(payMe.requests.load(1)?.history).toHaveLength(1);

		created(changeState(payMe, leadership(), 1, 'approve'));
		expect(changeState(payMe, courierManager, 1, 'reject', 'Blurry')).toEqual({
			ok: false,
			error: { code: 'already-decided', number: 1, state: 'approved' }
		});
		expect(changeState(payMe, alex, 1, 'withdraw')).toEqual({ ok: false, error: { code: 'cannot-withdraw', number: 1, state: 'approved' } });
	});
});

describe('Reasons', () => {
	it.each(['reject', 'deny'] as const)('are required to %s, and recorded trimmed', (change) => {
		const payMe = requestIn('pending');

		for (const blank of [null, '  ']) {
			expect(changeState(payMe, courierManager, 1, change, blank)).toEqual({ ok: false, error: { code: 'reason-required' } });
		}
		expect(payMe.requests.load(1)?.state).toBe('pending');

		created(changeState(payMe, courierManager, 1, change, ' Blurry screenshot '));
		expect(payMe.requests.load(1)?.history.at(-1)?.reason).toBe('Blurry screenshot');
	});
});

describe('Who may change a Payment Request', () => {
	const sam = member('user-sam', 'role-courier');
	const logisticsManager = member('user-lee', 'role-logistics-manager');

	it.each(['amend', 'withdraw'] as const)('lets only the Employee who owns the request %s it', (change) => {
		const payMe = requestIn('rejected');

		for (const other of [courierManager, leadership(), sam]) {
			expect(changeState(payMe, other, 1, change)).toEqual({ ok: false, error: { code: 'not-your-request' } });
		}
		expect(payMe.requests.load(1)?.state).toBe('rejected');
	});

	it('leaves withdrawing to the Employee when a Manager filed the request for them', () => {
		const { payMe } = courierPayMe();
		submitParcel(payMe, courierManager);

		expect(changeState(payMe, courierManager, 1, 'withdraw')).toEqual({ ok: false, error: { code: 'not-your-request' } });
		expect(changeState(payMe, alex, 1, 'withdraw')).toMatchObject({ ok: true, value: { state: 'withdrawn' } });
	});

	it.each(['approve', 'reject', 'deny'] as const)('lets a Manager of an eligible Job, Leadership or the filing Manager %s', (change) => {
		for (const reviewer of [courierManager, leadership()]) {
			expect(changeState(requestIn('pending'), reviewer, 1, change, 'Because')).toMatchObject({ ok: true });
		}

		const { payMe } = courierPayMe();
		submitParcel(payMe, courierManager);
		expect(changeState(payMe, courierManager, 1, change, 'Because')).toMatchObject({ ok: true });
	});

	it.each(['approve', 'reject', 'deny'] as const)('refuses to let someone unrelated %s', (change) => {
		const payMe = requestIn('pending');

		for (const other of [logisticsManager, sam]) {
			expect(changeState(payMe, other, 1, change, 'Because')).toEqual({ ok: false, error: { code: 'not-a-reviewer' } });
		}
		expect(payMe.requests.load(1)?.state).toBe('pending');
	});

	it.each(['approve', 'reject', 'deny'] as const)(
		'stops the Employee who owns the request being the one to %s it, even as a Manager or Leadership',
		(change) => {
			const alexAsReviewer = member('user-alex', 'role-courier', 'role-courier-manager', 'role-leadership');

			expect(changeState(requestIn('pending'), alexAsReviewer, 1, change, 'Because')).toEqual({ ok: false, error: { code: 'own-request' } });
		}
	);

	it('lets only Leadership mark a request paid', () => {
		const payMe = requestIn('approved');

		for (const other of [alex, courierManager, sam]) {
			expect(changeState(payMe, other, 1, 'pay')).toEqual({ ok: false, error: { code: 'not-permitted' } });
		}
		expect(payMe.requests.load(1)?.state).toBe('approved');
	});

	it('checks who is acting before the state', () => {
		const payMe = requestIn('denied');

		expect(changeState(payMe, sam, 1, 'withdraw')).toEqual({ ok: false, error: { code: 'not-your-request' } });
		expect(changeState(payMe, sam, 1, 'approve')).toEqual({ ok: false, error: { code: 'not-a-reviewer' } });
	});

	it('says when the request does not exist', () => {
		const { payMe } = courierPayMe();

		expect(changeState(payMe, alex, 99, 'withdraw')).toEqual({ ok: false, error: { code: 'request-not-found' } });
	});
});
