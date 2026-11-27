import { describe, expect, it } from 'vitest';
import {
	addTask,
	appropriationReport,
	recentMonths,
	approveRequest,
	closeProject,
	createJob,
	createProject,
	generatePayout,
	giveShare,
	hireEmployee,
	markPayoutPaid,
	recordRequestsThread,
	setAppropriation,
	showAppropriation,
	submitRequest,
	type Actor,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const november = new Date('2026-11-15T12:00:00Z');

const alex = member('user-alex', 'role-courier');
const bo = member('user-bo', 'role-logistics');

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

function job(payMe: PayMe, name: string) {
	const slug = name.toLowerCase();
	return created(createJob(payMe, leadership(), { name, employeeRoleId: `role-${slug}`, reviewChannelId: `review-${slug}` }));
}

function hire(payMe: PayMe, employee: Actor, minecraftName: string) {
	const { userId } = employee;
	created(hireEmployee(payMe, leadership(), employee, minecraftName));
	recordRequestsThread(payMe, userId, { channelId: `channel-${userId}`, pinnedMessageId: `pin-${userId}`, threadId: `thread-${userId}` });
}

function approve(payMe: PayMe, employee: Actor, taskId: number) {
	const request = created(submitRequest(payMe, employee, { taskId, notes: 'Done', link: 'https://example.com/proof', files: [] }));
	created(approveRequest(payMe, leadership(), request.number));
}

/** Generates the Employee's Payout and marks it paid at `paidAt`. */
function paidAt(payMe: PayMe, employee: Actor, at: string) {
	const payout = created(generatePayout(payMe, leadership(), employee.userId));
	created(markPayoutPaid(payMe, leadership(), payout.number, payout.revision));
	payMe.storage.db.$client.prepare('UPDATE payouts SET settled_at = ? WHERE number = ?').run(at, payout.number);
}

/** Alex, a Courier, does Deliver Parcel (Rate 1000); Bo, in Logistics, does Load Crate (Rate 300) and works on the Warehouse Project. */
function courierAndLogistics() {
	const payMe = createTestPayMe();
	const courier = job(payMe, 'Courier');
	const logistics = job(payMe, 'Logistics');
	const parcel = created(addTask(payMe, leadership(), { name: 'Deliver Parcel', rate: '1000', jobIds: [courier.id] }));
	const crate = created(addTask(payMe, leadership(), { name: 'Load Crate', rate: '300', jobIds: [logistics.id] }));
	const warehouse = created(createProject(payMe, leadership(), { name: 'Warehouse', jobId: logistics.id, budget: '1000' }));
	hire(payMe, alex, 'Alex_42');
	hire(payMe, bo, 'Bo_7');
	return { payMe, parcel, crate, warehouse };
}

describe('Setting the Appropriation', () => {
	it('applies from the month given until another is set', () => {
		const payMe = createTestPayMe();
		created(setAppropriation(payMe, leadership(), '5000', '2026-10'));
		created(setAppropriation(payMe, leadership(), '6000.5', '2027-01'));

		const appropriationIn = (month: string) => created(showAppropriation(payMe, leadership(), month, november)).appropriation;
		expect(appropriationIn('2026-09')).toBeNull();
		expect(appropriationIn('2026-10')).toBe(500000);
		expect(appropriationIn('2026-12')).toBe(500000);
		expect(appropriationIn('2027-01')).toBe(600050);
	});

	it('is refused to anyone but Leadership, and so is viewing it', () => {
		const payMe = createTestPayMe();
		const manager = member('user-casey', 'role-courier-manager');

		expect(setAppropriation(payMe, manager, '5000', '2026-11')).toEqual({ ok: false, error: { code: 'not-permitted' } });
		expect(showAppropriation(payMe, manager, null, november)).toEqual({ ok: false, error: { code: 'not-permitted' } });
	});

	it('refuses an amount or month PayMe cannot read', () => {
		const payMe = createTestPayMe();

		expect(setAppropriation(payMe, leadership(), '$5,000', '2026-11')).toMatchObject({ error: { code: 'invalid-amount' } });
		expect(setAppropriation(payMe, leadership(), '0', '2026-11')).toMatchObject({ error: { code: 'invalid-amount' } });
		expect(setAppropriation(payMe, leadership(), '5000', 'November')).toMatchObject({ error: { code: 'invalid-month' } });
		expect(setAppropriation(payMe, leadership(), '5000', '2026-13')).toMatchObject({ error: { code: 'invalid-month' } });
		expect(showAppropriation(payMe, leadership(), '2026-1', november)).toMatchObject({ error: { code: 'invalid-month' } });
	});
});

describe('Spend in a month', () => {
	it('counts each Payout in the UTC month it was marked paid, by Job', () => {
		const { payMe, parcel, crate, warehouse } = courierAndLogistics();
		approve(payMe, alex, parcel.id);
		paidAt(payMe, alex, '2026-10-31T23:59:59.000Z');
		approve(payMe, alex, parcel.id);
		paidAt(payMe, alex, '2026-11-01T00:00:00.000Z');
		approve(payMe, bo, crate.id);
		created(giveShare(payMe, leadership(), warehouse.id, bo, { amount: '250', note: null }));
		paidAt(payMe, bo, '2026-11-20T09:00:00.000Z');

		expect(created(showAppropriation(payMe, leadership(), '2026-10', november))).toMatchObject({
			spent: 100000,
			spentByJob: [{ job: 'Courier', amount: 100000 }]
		});
		expect(created(showAppropriation(payMe, leadership(), '2026-11', november))).toMatchObject({
			spent: 155000,
			spentByJob: [
				{ job: 'Courier', amount: 100000 },
				{ job: 'Logistics', amount: 55000 }
			]
		});
	});
});

describe('The current month', () => {
	it('shows what is Committed and Reserved, and what would remain after both', () => {
		const { payMe, parcel, crate, warehouse } = courierAndLogistics();
		created(setAppropriation(payMe, leadership(), '5000', '2026-10'));
		approve(payMe, alex, parcel.id);
		paidAt(payMe, alex, '2026-11-02T10:00:00.000Z');
		approve(payMe, alex, parcel.id);
		approve(payMe, bo, crate.id);
		created(generatePayout(payMe, leadership(), bo.userId));
		created(giveShare(payMe, leadership(), warehouse.id, bo, { amount: '250', note: null }));
		const depot = created(createProject(payMe, leadership(), { name: 'Old Depot', jobId: warehouse.jobId, budget: '500' }));
		created(closeProject(payMe, leadership(), depot.id));

		expect(created(showAppropriation(payMe, leadership(), null, november))).toMatchObject({
			month: '2026-11',
			appropriation: 500000,
			spent: 100000,
			committed: 155000,
			committedEstimate: 100000,
			reserved: 75000,
			remaining: 400000,
			remainingAfterCommitted: 245000
		});
	});

	it('shows only the Appropriation and Spend for any other month', () => {
		const { payMe, parcel } = courierAndLogistics();
		created(setAppropriation(payMe, leadership(), '5000', '2026-10'));
		approve(payMe, alex, parcel.id);

		expect(created(showAppropriation(payMe, leadership(), '2026-10', november))).toMatchObject({
			appropriation: 500000,
			spent: 0,
			committed: null,
			committedEstimate: null,
			reserved: null,
			remaining: null,
			remainingAfterCommitted: null
		});
	});

	it('has nothing remaining to show in a month with no Appropriation', () => {
		const { payMe } = courierAndLogistics();

		expect(created(showAppropriation(payMe, leadership(), null, november))).toMatchObject({
			appropriation: null,
			remaining: null,
			remainingAfterCommitted: null
		});
	});
});

describe('What Leadership sees', () => {
	it('lists the month in dollars, labelling Committed as an estimate', () => {
		const { payMe, parcel, crate } = courierAndLogistics();
		created(setAppropriation(payMe, leadership(), '5000', '2026-11'));
		approve(payMe, alex, parcel.id);
		paidAt(payMe, alex, '2026-11-02T10:00:00.000Z');
		approve(payMe, bo, crate.id);

		expect(showAppropriation(payMe, leadership(), null, november)).toMatchObject({
			effects: [
				{
					type: 'show-appropriation',
					month: '2026-11',
					card: {
						title: 'Appropriation · November 2026',
						description: [
							'**Appropriation**: $5,000',
							'**Spent**: $1,000',
							'**Committed**: $300, including $300 estimated at current Rates',
							'**Reserved**: $1,000 in Open Projects',
							'**Remaining**: $4,000',
							'**Remaining after commitments**: $3,700',
							'',
							'**Spent by Job**',
							'- Courier: $1,000'
						].join('\n')
					}
				}
			]
		});
	});

	it('shows only Spend for a past month without an Appropriation', () => {
		const { payMe } = courierAndLogistics();

		expect(showAppropriation(payMe, leadership(), '2026-10', november)).toMatchObject({
			effects: [
				{
					card: {
						title: 'Appropriation · October 2026',
						description: ['**Appropriation**: Not set', '**Spent**: $0', '', '**Spent by Job**', 'Nothing was paid.'].join('\n')
					}
				}
			]
		});
	});
});

describe('Months to pick from', () => {
	it('offers next month and the twelve before it, newest first, across a year boundary', () => {
		const months = recentMonths(new Date('2026-12-31T23:00:00Z'));

		expect(months).toHaveLength(13);
		expect(months.slice(0, 3)).toEqual(['2027-01', '2026-12', '2026-11']);
		expect(months.at(-1)).toBe('2026-01');
	});
});

describe('The report', () => {
	/** October: Alex paid with no Appropriation set. November ($5,000): Alex paid, then Bo paid for a request and a Warehouse Share. */
	function twoMonths() {
		const fixture = courierAndLogistics();
		const { payMe, parcel, crate, warehouse } = fixture;
		created(setAppropriation(payMe, leadership(), '5000', '2026-11'));
		approve(payMe, alex, parcel.id);
		paidAt(payMe, alex, '2026-10-15T08:00:00.000Z');
		approve(payMe, alex, parcel.id);
		paidAt(payMe, alex, '2026-11-02T10:00:00.000Z');
		approve(payMe, bo, crate.id);
		created(giveShare(payMe, leadership(), warehouse.id, bo, { amount: '250.5', note: null }));
		paidAt(payMe, bo, '2026-11-20T09:00:00.000Z');
		return fixture;
	}

	it('summarises each month against its Appropriation, with Employee Pay by Job', () => {
		const { payMe } = twoMonths();

		expect(created(appropriationReport(payMe, leadership(), '2026-10', '2026-11')).summary).toBe(
			[
				'month,spending_category,job,appropriation,spent,over_under',
				'2026-10,,,,1000,',
				'2026-10,Employee Pay,,,1000,',
				'2026-10,Employee Pay,Courier,,1000,',
				'2026-11,,,5000,1550.5,-3449.5',
				'2026-11,Employee Pay,,,1550.5,',
				'2026-11,Employee Pay,Courier,,1000,',
				'2026-11,Employee Pay,Logistics,,550.5,',
				''
			].join('\n')
		);
	});

	it('lists every paid Payout line and Share at its frozen amount, by date paid', () => {
		const { payMe } = twoMonths();

		expect(created(appropriationReport(payMe, leadership(), '2026-10', '2026-11')).items).toBe(
			[
				'date_paid,month,spending_category,job,task_or_project,recipient,amount,paid_by,reference,payout',
				'2026-10-15,2026-10,Employee Pay,Courier,Deliver Parcel,Alex_42,1000,user-leadership,R-1,P-1',
				'2026-11-02,2026-11,Employee Pay,Courier,Deliver Parcel,Alex_42,1000,user-leadership,R-2,P-2',
				'2026-11-20,2026-11,Employee Pay,Logistics,Load Crate,Bo_7,300,user-leadership,R-3,P-3',
				'2026-11-20,2026-11,Employee Pay,Logistics,Warehouse,Bo_7,250.5,user-leadership,S-1,P-3',
				''
			].join('\n')
		);
	});

	it('attaches both files to a private reply for the months chosen', () => {
		const { payMe } = twoMonths();
		const report = appropriationReport(payMe, leadership(), '2026-11', '2026-11');

		expect(report).toMatchObject({
			effects: [
				{
					type: 'private-files',
					card: { description: 'Spend from November 2026 to November 2026.' },
					files: [
						{ name: 'summary.csv', content: created(report).summary },
						{ name: 'items.csv', content: created(report).items }
					]
				}
			]
		});
		expect(created(report).items.split('\n')).toHaveLength(5);
	});

	it('is refused to anyone but Leadership, and for months that run backwards', () => {
		const payMe = createTestPayMe();

		expect(appropriationReport(payMe, member('user-casey'), '2026-10', '2026-11')).toEqual({ ok: false, error: { code: 'not-permitted' } });
		expect(appropriationReport(payMe, leadership(), '2026-11', '2026-10')).toEqual({
			ok: false,
			error: { code: 'invalid-month-range', from: '2026-11', to: '2026-10' }
		});
	});
});
