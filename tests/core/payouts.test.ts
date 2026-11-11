import { describe, expect, it } from 'vitest';
import {
	addManagerRole,
	addTask,
	approveRequest,
	changeRate,
	createJob,
	discardPayout,
	generatePayout,
	getPaymentRequest,
	getPayout,
	markPayoutPaid,
	payCommand,
	hireEmployee,
	recordRequestsThread,
	retireJob,
	retireTask,
	submitRequest,
	showPayout,
	showPayouts,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const screenshot = { name: 'proof.png', url: 'https://cdn.example/proof.png' };
const alex = member('user-alex', 'role-courier');

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

function approved(payMe: PayMe, employee: ReturnType<typeof member>, taskId: number): number {
	const request = created(submitRequest(payMe, employee, { taskId, notes: 'Done', link: null, files: [screenshot] }));
	created(approveRequest(payMe, leadership(), request.number));
	return request.number;
}

/** Alex, a Courier with Minecraft Name Alex_42, can request Deliver Parcel (Rate 1000) and Sort Mail (Rate 500.25). */
function courierAlex() {
	const payMe = createTestPayMe();
	const courier = job(payMe, 'Courier');
	const parcel = created(addTask(payMe, leadership(), { name: 'Deliver Parcel', rate: '1000', jobIds: [courier.id] }));
	const mail = created(addTask(payMe, leadership(), { name: 'Sort Mail', rate: '500.25', jobIds: [courier.id] }));
	hire(payMe, 'user-alex', 'Alex_42');
	return { payMe, courier, parcel, mail };
}

describe('Generating a Payout', () => {
	it("freezes the Employee's Approved requests, their current Rates, Minecraft Name and total as P-1", () => {
		const { payMe, courier, parcel, mail } = courierAlex();
		approved(payMe, alex, parcel.id);
		approved(payMe, alex, mail.id);

		expect(generatePayout(payMe, leadership(), 'user-alex')).toMatchObject({
			ok: true,
			value: {
				number: 1,
				employeeUserId: 'user-alex',
				minecraftName: 'Alex_42',
				state: 'open',
				total: 150025,
				lines: [
					{ requestNumber: 1, taskId: parcel.id, jobId: courier.id, rate: 100000 },
					{ requestNumber: 2, taskId: mail.id, jobId: courier.id, rate: 50025 }
				]
			}
		});
	});
});

describe('The Pay Command', () => {
	it.each([
		[['1000', '500'], '1500'],
		[['1000', '500.5'], '1500.5'],
		[['1000', '500.25'], '1500.25'],
		[['999999.95', '0.05'], '1000000'],
		[['0.05'], '0.05']
	])('for Rates %j pays %s, with at most two decimal places, no trailing zeros and no thousands separators', (rates, amount) => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		hire(payMe, 'user-alex', 'Alex_42');
		rates.forEach((rate, index) => {
			const task = created(addTask(payMe, leadership(), { name: `Task ${index}`, rate, jobIds: [courier.id] }));
			approved(payMe, alex, task.id);
		});

		const payout = created(generatePayout(payMe, leadership(), 'user-alex'));

		expect(payCommand(payout)).toBe(`/gov payout GovCommerce Alex_42 ${amount} PayMe P-1`);
	});

	it('is shown to Leadership in a copyable code block with a breakdown grouped by Job', () => {
		const { payMe, courier, parcel, mail } = courierAlex();
		const logistics = job(payMe, 'Logistics');
		const cart = created(addTask(payMe, leadership(), { name: 'Load Cart', rate: '250', jobIds: [logistics.id] }));
		const both = member('user-alex', 'role-courier', 'role-logistics');
		approved(payMe, both, parcel.id);
		approved(payMe, both, cart.id);
		approved(payMe, both, mail.id);

		expect(generatePayout(payMe, leadership(), 'user-alex')).toMatchObject({
			effects: [
				{
					type: 'show-payout',
					payoutNumber: 1,
					content: [
						'**P-1** for <@user-alex> (Alex_42): 1750.25, Open',
						'```',
						'/gov payout GovCommerce Alex_42 1750.25 PayMe P-1',
						'```',
						`**${courier.name}**: 1500.25`,
						'- **R-1** Deliver Parcel: 1000',
						'- **R-3** Sort Mail: 500.25',
						`**${logistics.name}**: 250`,
						'- **R-2** Load Cart: 250'
					].join('\n')
				}
			]
		});
	});
});

describe('Marking a Payout paid', () => {
	it('moves exactly the requests in the Payout to Paid, leaving requests approved after generation for the next Payout', () => {
		const { payMe, parcel, mail } = courierAlex();
		approved(payMe, alex, parcel.id);
		created(generatePayout(payMe, leadership(), 'user-alex'));
		approved(payMe, alex, mail.id);

		expect(markPayoutPaid(payMe, leadership('user-lin'), 1)).toMatchObject({ ok: true, value: { state: 'paid', settledBy: 'user-lin' } });
		expect(getPaymentRequest(payMe, 1)?.state).toBe('paid');
		expect(getPaymentRequest(payMe, 1)?.history.at(-1)).toMatchObject({ from: 'approved', to: 'paid', actorUserId: 'user-lin' });
		expect(getPaymentRequest(payMe, 2)?.state).toBe('approved');
		expect(getPayout(payMe, 1)?.lines.map((line) => line.requestNumber)).toEqual([1]);
	});

	it('pays the Rates frozen at generation, even after a Rate change', () => {
		const { payMe, parcel } = courierAlex();
		approved(payMe, alex, parcel.id);
		created(generatePayout(payMe, leadership(), 'user-alex'));
		created(changeRate(payMe, leadership(), parcel.id, '2000'));

		const payout = created(markPayoutPaid(payMe, leadership(), 1));

		expect(payout).toMatchObject({ total: 100000, lines: [{ rate: 100000 }] });
		expect(payCommand(payout)).toBe('/gov payout GovCommerce Alex_42 1000 PayMe P-1');
	});

	it("logs the Payout in the Employee's Requests Thread without a ping, and updates each request's review copies", () => {
		const { payMe, parcel, mail } = courierAlex();
		approved(payMe, alex, parcel.id);
		approved(payMe, alex, mail.id);
		created(generatePayout(payMe, leadership(), 'user-alex'));

		expect(markPayoutPaid(payMe, leadership('user-lin'), 1)).toMatchObject({
			effects: [
				{ type: 'update-review-copies', requestNumber: 1, content: expect.stringContaining('**Paid** by <@user-lin>') },
				{ type: 'update-review-copies', requestNumber: 2, content: expect.stringContaining('**Paid** by <@user-lin>') },
				{
					type: 'post-to-requests-thread',
					employeeUserId: 'user-alex',
					content: [
						'**P-1** paid by <@user-lin>: 1500.25 to Alex_42',
						'- **R-1** Deliver Parcel: 1000',
						'- **R-2** Sort Mail: 500.25'
					].join('\n'),
					ping: false
				},
				{ type: 'private-reply', content: 'Marked P-1 paid.' }
			]
		});
	});
});

describe('One Open Payout per Employee', () => {
	it('refuses a second Payout while one is Open, even for requests approved since', () => {
		const { payMe, parcel, mail } = courierAlex();
		approved(payMe, alex, parcel.id);
		created(generatePayout(payMe, leadership(), 'user-alex'));
		approved(payMe, alex, mail.id);

		expect(generatePayout(payMe, leadership(), 'user-alex')).toEqual({ ok: false, error: { code: 'payout-already-open', number: 1 } });
	});

	it('allows the next Payout once the Open one is paid', () => {
		const { payMe, parcel, mail } = courierAlex();
		approved(payMe, alex, parcel.id);
		created(generatePayout(payMe, leadership(), 'user-alex'));
		approved(payMe, alex, mail.id);
		created(markPayoutPaid(payMe, leadership(), 1));

		expect(generatePayout(payMe, leadership(), 'user-alex')).toMatchObject({ ok: true, value: { number: 2, lines: [{ requestNumber: 2 }] } });
	});

	it('refuses a Payout for an Employee who is owed nothing, or for someone who is not an Employee', () => {
		const { payMe, parcel } = courierAlex();
		created(submitRequest(payMe, alex, { taskId: parcel.id, notes: 'Done', link: null, files: [screenshot] }));

		expect(generatePayout(payMe, leadership(), 'user-alex')).toEqual({ ok: false, error: { code: 'nothing-owed' } });
		expect(generatePayout(payMe, leadership(), 'user-nobody')).toEqual({ ok: false, error: { code: 'employee-not-found' } });
	});

	it('refuses to mark paid a Payout that is already Paid', () => {
		const { payMe, parcel } = courierAlex();
		approved(payMe, alex, parcel.id);
		created(generatePayout(payMe, leadership(), 'user-alex'));
		created(markPayoutPaid(payMe, leadership(), 1));

		expect(markPayoutPaid(payMe, leadership(), 1)).toEqual({ ok: false, error: { code: 'payout-not-open', number: 1, state: 'paid' } });
		expect(markPayoutPaid(payMe, leadership(), 9)).toEqual({ ok: false, error: { code: 'payout-not-found' } });
	});
});

describe('Discarding a Payout', () => {
	it('returns its requests to Approved so a new Payout picks them up at the current Rates', () => {
		const { payMe, parcel } = courierAlex();
		approved(payMe, alex, parcel.id);
		created(generatePayout(payMe, leadership(), 'user-alex'));
		created(changeRate(payMe, leadership(), parcel.id, '1200'));

		expect(discardPayout(payMe, leadership('user-lin'), 1)).toMatchObject({
			ok: true,
			value: { state: 'discarded', settledBy: 'user-lin' },
			effects: [{ type: 'private-reply', content: 'Discarded P-1. R-1 can be paid in a new Payout.' }]
		});
		expect(getPaymentRequest(payMe, 1)?.state).toBe('approved');
		expect(generatePayout(payMe, leadership(), 'user-alex')).toMatchObject({ ok: true, value: { number: 2, total: 120000 } });
	});

	it('refuses to discard a Payout that is no longer Open', () => {
		const { payMe, parcel } = courierAlex();
		approved(payMe, alex, parcel.id);
		created(generatePayout(payMe, leadership(), 'user-alex'));
		created(markPayoutPaid(payMe, leadership(), 1));

		expect(discardPayout(payMe, leadership(), 1)).toEqual({ ok: false, error: { code: 'payout-not-open', number: 1, state: 'paid' } });
		expect(getPaymentRequest(payMe, 1)?.state).toBe('paid');
	});
});

describe('Retired Tasks and Jobs', () => {
	it('stay payable at their last Rate', () => {
		const { payMe, courier, parcel, mail } = courierAlex();
		approved(payMe, alex, parcel.id);
		approved(payMe, alex, mail.id);
		created(retireTask(payMe, leadership(), mail.id));
		created(retireJob(payMe, leadership(), courier.id));

		expect(generatePayout(payMe, leadership(), 'user-alex')).toMatchObject({ ok: true, value: { total: 150025 } });
		expect(markPayoutPaid(payMe, leadership(), 1)).toMatchObject({ ok: true });
		expect([getPaymentRequest(payMe, 1)?.state, getPaymentRequest(payMe, 2)?.state]).toEqual(['paid', 'paid']);
	});
});

describe('The payouts view', () => {
	function twoEmployees() {
		const setup = courierAlex();
		const { payMe, parcel, mail } = setup;
		hire(payMe, 'user-bo', 'Bo_7');
		const bo = member('user-bo', 'role-courier');
		approved(payMe, alex, parcel.id);
		approved(payMe, bo, mail.id);
		approved(payMe, bo, parcel.id);
		return setup;
	}

	it('lists every Employee with Approved, unpaid requests and their estimated totals at current Rates', () => {
		const { payMe, parcel } = twoEmployees();
		created(changeRate(payMe, leadership(), parcel.id, '1100'));

		expect(created(showPayouts(payMe, leadership(), [])).owed).toEqual([
			{ employeeUserId: 'user-alex', minecraftName: 'Alex_42', unpaidRequestNumbers: [1], estimatedTotal: 110000, openPayout: null },
			{ employeeUserId: 'user-bo', minecraftName: 'Bo_7', unpaidRequestNumbers: [2, 3], estimatedTotal: 160025, openPayout: null }
		]);
	});

	it('keeps an Employee listed with their Open Payout until it is paid, and lists Paid Payouts as history', () => {
		const { payMe } = twoEmployees();
		created(generatePayout(payMe, leadership(), 'user-alex'));
		created(generatePayout(payMe, leadership(), 'user-bo'));
		created(markPayoutPaid(payMe, leadership(), 2));

		const view = created(showPayouts(payMe, leadership(), []));
		expect(view.owed).toMatchObject([{ employeeUserId: 'user-alex', unpaidRequestNumbers: [], estimatedTotal: 0, openPayout: { number: 1 } }]);
		expect(view.history).toMatchObject([{ number: 2, employeeUserId: 'user-bo', state: 'paid' }]);
	});

	it('shows Leadership who is owed, labelled as estimates, with a button to generate or open each Payout', () => {
		const { payMe } = twoEmployees();
		created(generatePayout(payMe, leadership(), 'user-alex'));

		expect(showPayouts(payMe, leadership(), [])).toMatchObject({
			ok: true,
			effects: [
				{
					type: 'show-payouts',
					content: [
						'**Payouts**',
						'<@user-alex> (Alex_42): Open Payout **P-1**, 1000',
						'<@user-bo> (Bo_7): about 1500.25 owed (estimate at current Rates) for R-2, R-3'
					].join('\n'),
					actions: [
						{ kind: 'show', payoutNumber: 1, label: 'P-1 for Alex_42' },
						{ kind: 'generate', employeeUserId: 'user-bo', label: 'Generate for Bo_7' }
					]
				}
			]
		});
	});

	it('shows Leadership an Open Payout again when they open it', () => {
		const { payMe } = twoEmployees();
		created(generatePayout(payMe, leadership(), 'user-alex'));

		expect(showPayout(payMe, leadership(), 1)).toMatchObject({
			ok: true,
			effects: [{ type: 'show-payout', payoutNumber: 1, content: expect.stringContaining('/gov payout GovCommerce Alex_42 1000 PayMe P-1') }]
		});
		expect(showPayout(payMe, leadership(), 9)).toEqual({ ok: false, error: { code: 'payout-not-found' } });
	});

	it('tells Leadership when nobody is owed anything', () => {
		const { payMe } = courierAlex();

		expect(showPayouts(payMe, leadership(), [])).toMatchObject({
			effects: [{ type: 'show-payouts', content: '**Payouts**\nNobody is owed anything.', actions: [] }]
		});
	});
});

describe('Who can pay', () => {
	it('lets only Leadership open, generate, mark paid or discard Payouts, refusing Managers and Employees', () => {
		const { payMe, parcel, mail } = courierAlex();
		approved(payMe, alex, parcel.id);
		created(generatePayout(payMe, leadership(), 'user-alex'));
		created(submitRequest(payMe, alex, { taskId: mail.id, notes: 'Done', link: null, files: [screenshot] }));
		hire(payMe, 'user-bo', 'Bo_7');
		approved(payMe, member('user-bo', 'role-courier'), parcel.id);
		const notPermitted = { ok: false, error: { code: 'not-permitted' } };

		for (const actor of [member('user-casey', 'role-courier-manager'), alex]) {
			expect(showPayout(payMe, actor, 1)).toEqual(notPermitted);
			expect(generatePayout(payMe, actor, 'user-bo')).toEqual(notPermitted);
			expect(markPayoutPaid(payMe, actor, 1)).toEqual(notPermitted);
			expect(discardPayout(payMe, actor, 1)).toEqual(notPermitted);
		}
		expect(getPayout(payMe, 1)?.state).toBe('open');
		expect(getPayout(payMe, 2)).toBeNull();
	});

	it('refuses the payouts view to anyone who is neither Leadership nor a Manager', () => {
		const { payMe } = courierAlex();

		expect(showPayouts(payMe, alex, [alex])).toEqual({ ok: false, error: { code: 'not-permitted' } });
	});
});

describe("A Manager's payouts view", () => {
	const casey = member('user-casey', 'role-courier-manager');

	/** Alex is a Courier, Bo works in Logistics, and Casey manages Courier. */
	function courierAndLogistics() {
		const setup = courierAlex();
		const { payMe, parcel } = setup;
		const logistics = job(payMe, 'Logistics');
		const cart = created(addTask(payMe, leadership(), { name: 'Load Cart', rate: '250', jobIds: [logistics.id] }));
		hire(payMe, 'user-bo', 'Bo_7');
		const bo = member('user-bo', 'role-logistics');
		approved(payMe, alex, parcel.id);
		approved(payMe, bo, cart.id);
		return { ...setup, members: [alex, bo, casey] };
	}

	it('shows only Employees holding Jobs the Manager manages, with no buttons', () => {
		const { payMe, members } = courierAndLogistics();

		expect(showPayouts(payMe, casey, members)).toMatchObject({
			ok: true,
			value: { owed: [{ employeeUserId: 'user-alex', estimatedTotal: 100000 }], history: [] },
			effects: [
				{
					type: 'show-payouts',
					content: [
						'**Payouts** (read-only)',
						'<@user-alex> (Alex_42): about 1000 owed (estimate at current Rates) for R-1',
						'**Payout history**',
						'No Payouts yet.'
					].join('\n'),
					actions: []
				}
			]
		});
	});

	it('lists the Paid and Discarded Payouts of the Job holders as history with number, total, date and state, newest first', () => {
		const { payMe, members } = courierAndLogistics();
		created(generatePayout(payMe, leadership(), 'user-alex'));
		created(discardPayout(payMe, leadership(), 1));
		created(generatePayout(payMe, leadership(), 'user-alex'));
		created(markPayoutPaid(payMe, leadership(), 2));
		created(generatePayout(payMe, leadership(), 'user-bo'));
		created(markPayoutPaid(payMe, leadership(), 3));

		const outcome = showPayouts(payMe, casey, members);

		expect(outcome).toMatchObject({
			ok: true,
			value: {
				owed: [],
				history: [
					{ number: 2, total: 100000, state: 'paid', settledAt: expect.any(String) },
					{ number: 1, total: 100000, state: 'discarded', settledAt: expect.any(String) }
				]
			}
		});
		const content = outcome.ok ? outcome.effects[0] : null;
		expect(content).toMatchObject({
			content: expect.stringMatching(
				/\*\*Payout history\*\*\n\*\*P-2\*\* for <@user-alex> \(Alex_42\): 1000, Paid on \d{4}-\d{2}-\d{2}\n\*\*P-1\*\* for <@user-alex> \(Alex_42\): 1000, Discarded on \d{4}-\d{2}-\d{2}$/
			)
		});
	});

	it('still shows Employees who no longer hold the Job but are owed for requests submitted for it', () => {
		const { payMe, parcel } = courierAndLogistics();
		hire(payMe, 'user-cy', 'Cy_3');
		approved(payMe, member('user-cy', 'role-courier'), parcel.id);
		created(generatePayout(payMe, leadership(), 'user-cy'));
		const leftCourier = [member('user-alex'), member('user-cy'), member('user-bo', 'role-logistics'), casey];

		expect(showPayouts(payMe, casey, leftCourier)).toMatchObject({
			value: {
				owed: [
					{ employeeUserId: 'user-alex', unpaidRequestNumbers: [1], openPayout: null },
					{ employeeUserId: 'user-cy', unpaidRequestNumbers: [], openPayout: { number: 1 } }
				]
			}
		});
	});

	it('covers every Job the Manager manages, and Leadership still sees everyone', () => {
		const { payMe, members } = courierAndLogistics();
		const both = member('user-dana', 'role-courier-manager', 'role-logistics-manager');

		expect(showPayouts(payMe, both, members)).toMatchObject({
			value: { owed: [{ employeeUserId: 'user-alex' }, { employeeUserId: 'user-bo' }] }
		});
		expect(showPayouts(payMe, leadership(), [])).toMatchObject({
			value: { owed: [{ employeeUserId: 'user-alex' }, { employeeUserId: 'user-bo' }] }
		});
	});
});
