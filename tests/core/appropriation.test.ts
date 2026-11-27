import { describe, expect, it } from 'vitest';
import {
	addTask,
	appropriationDisbursements,
	declineDisbursement,
	markDisbursementPaid,
	requestDisbursement,
	addSpendingCategory,
	setSpendingCategoryTarget,
	retireSpendingCategory,
	fundProject,
	getPayout,
	monthName,
	monthOf,
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
							'**Spending Categories**',
							'- Employee Pay: no target · Spent $1,000 · Committed $300 · Reserved $1,000',
							'- Unassigned: 100% ($5,000)',
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
						description: [
							'**Appropriation**: Not set',
							'**Spent**: $0',
							'',
							'**Spending Categories**',
							'- Employee Pay: no target · Spent $0',
							'- Unassigned: 100%',
							'',
							'**Spent by Job**',
							'Nothing was paid.'
						].join('\n')
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
				'month,spending_category,job,appropriation,target,spent,over_under',
				'2026-10,,,,,1000,',
				'2026-10,Employee Pay,,,,1000,',
				'2026-10,Employee Pay,Courier,,,1000,',
				'2026-11,,,5000,,1550.5,-3449.5',
				'2026-11,Employee Pay,,,,1550.5,',
				'2026-11,Employee Pay,Courier,,,1000,',
				'2026-11,Employee Pay,Logistics,,,550.5,',
				''
			].join('\n')
		);
	});

	it('reports each Spending Category against the target it had that month, listing only those it had then', () => {
		const { payMe } = twoMonths();
		created(setSpendingCategoryTarget(payMe, leadership(), 1, '10', november));
		created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));

		expect(created(appropriationReport(payMe, leadership(), '2026-10', '2026-11', november)).summary.split('\n')).toEqual([
			'month,spending_category,job,appropriation,target,spent,over_under',
			'2026-10,,,,,1000,',
			'2026-10,Employee Pay,,,,1000,',
			'2026-10,Employee Pay,Courier,,,1000,',
			'2026-11,,,5000,,1550.5,-3449.5',
			'2026-11,Employee Pay,,,500,1550.5,1050.5',
			'2026-11,Employee Pay,Courier,,,1000,',
			'2026-11,Employee Pay,Logistics,,,550.5,',
			'2026-11,Grants,,,,0,',
			''
		]);
	});

	it('lists every paid Payout line and Share at its frozen amount, by date paid', () => {
		const { payMe } = twoMonths();

		expect(created(appropriationReport(payMe, leadership(), '2026-10', '2026-11')).items).toBe(
			[
				'date_paid,month,spending_category,job,task_or_project,recipient,amount,requested_by,paid_by,reference,payout',
				'2026-10-15,2026-10,Employee Pay,Courier,Deliver Parcel,Alex_42,1000,,user-leadership,R-1,P-1',
				'2026-11-02,2026-11,Employee Pay,Courier,Deliver Parcel,Alex_42,1000,,user-leadership,R-2,P-2',
				'2026-11-20,2026-11,Employee Pay,Logistics,Load Crate,Bo_7,300,,user-leadership,R-3,P-3',
				'2026-11-20,2026-11,Employee Pay,Logistics,Warehouse,Bo_7,250.5,,user-leadership,S-1,P-3',
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

	it('refuses months outside 2000 to 2999, and ranges longer than ten years', () => {
		const payMe = createTestPayMe();

		expect(appropriationReport(payMe, leadership(), '2026-01', '9999-12')).toMatchObject({ error: { code: 'invalid-month', month: '9999-12' } });
		expect(appropriationReport(payMe, leadership(), '0050-01', '2026-01')).toMatchObject({ error: { code: 'invalid-month', month: '0050-01' } });
		expect(appropriationReport(payMe, leadership(), '2016-01', '2026-01')).toMatchObject({ error: { code: 'report-too-long', months: 121 } });
		expect(appropriationReport(payMe, leadership(), '2016-02', '2026-01')).toMatchObject({ ok: true });
	});

	it('keeps names a spreadsheet would read as formulas from running', () => {
		const { payMe, warehouse } = twoMonths();
		payMe.storage.db.$client.prepare('UPDATE projects SET name = ? WHERE id = ?').run('=HYPERLINK("x")', warehouse.id);

		expect(created(appropriationReport(payMe, leadership(), '2026-11', '2026-11')).items).toContain(`,"'=HYPERLINK(""x"")",Bo_7,250.5,`);
	});
});

describe('Warnings when going over the Appropriation', () => {
	const thisMonth = () => monthName(monthOf(new Date()));
	const warnings = (outcome: Outcome<unknown>) =>
		outcome.ok ? outcome.effects.filter((effect) => effect.type === 'private-reply' && effect.card.tone === 'warning') : [];

	it('warns when marking a Payout paid takes Spent over, and still marks it paid', () => {
		const { payMe, parcel } = courierAndLogistics();
		created(setAppropriation(payMe, leadership(), '1500', '2000-01'));
		approve(payMe, alex, parcel.id);
		const first = created(generatePayout(payMe, leadership(), alex.userId));
		expect(warnings(markPayoutPaid(payMe, leadership(), first.number, first.revision))).toEqual([]);

		approve(payMe, alex, parcel.id);
		const second = created(generatePayout(payMe, leadership(), alex.userId));
		const paid = markPayoutPaid(payMe, leadership(), second.number, second.revision);

		expect(warnings(paid)).toEqual([
			{
				type: 'private-reply',
				card: { tone: 'warning', description: `**Over the Appropriation**: ${thisMonth()} has spent $2,000 of its $1,500, $500 over.` }
			}
		]);
		expect(getPayout(payMe, second.number)?.state).toBe('paid');
	});

	it('warns when funding a Project takes Spent, Committed and Reserved over, and still funds it', () => {
		const { payMe, crate, warehouse } = courierAndLogistics();
		created(setAppropriation(payMe, leadership(), '1500', '2000-01'));
		approve(payMe, bo, crate.id);

		expect(warnings(fundProject(payMe, leadership(), warehouse.id, '100'))).toEqual([]);
		const funded = fundProject(payMe, leadership(), warehouse.id, '200');

		expect(warnings(funded)).toEqual([
			{
				type: 'private-reply',
				card: {
					tone: 'warning',
					description: `**Over the Appropriation**: ${thisMonth()}'s Spent, Committed and Reserved now come to $1,600 of its $1,500, $100 over.`
				}
			}
		]);
		expect(created(funded).funding.map((entry) => entry.amount)).toEqual([100000, 10000, 20000]);
	});

	it('warns when the opening budget of a new Project goes over', () => {
		const { payMe, warehouse } = courierAndLogistics();
		created(setAppropriation(payMe, leadership(), '1500', '2000-01'));

		expect(warnings(createProject(payMe, leadership(), { name: 'Shed', jobId: warehouse.jobId, budget: '500' }))).toEqual([]);
		expect(warnings(createProject(payMe, leadership(), { name: 'Depot', jobId: warehouse.jobId, budget: '1' }))).toHaveLength(1);
	});

	it('warns when marking a Payout paid takes Employee Pay over its target, alongside any Appropriation warning', () => {
		const { payMe, parcel } = courierAndLogistics();
		created(setAppropriation(payMe, leadership(), '1500', '2000-01'));
		created(setSpendingCategoryTarget(payMe, leadership(), 1, '50', new Date()));
		approve(payMe, alex, parcel.id);
		const first = created(generatePayout(payMe, leadership(), alex.userId));
		const firstPaid = markPayoutPaid(payMe, leadership(), first.number, first.revision);

		expect(warnings(firstPaid)).toEqual([
			{
				type: 'private-reply',
				card: {
					tone: 'warning',
					description: `**Over target**: Employee Pay has spent $1,000 of its $750 target for ${thisMonth()}, $250 over.`
				}
			}
		]);

		approve(payMe, alex, parcel.id);
		const second = created(generatePayout(payMe, leadership(), alex.userId));
		expect(
			warnings(markPayoutPaid(payMe, leadership(), second.number, second.revision)).map(
				(each) => each.type === 'private-reply' && each.card.description
			)
		).toEqual([
			`**Over the Appropriation**: ${thisMonth()} has spent $2,000 of its $1,500, $500 over.`,
			`**Over target**: Employee Pay has spent $2,000 of its $750 target for ${thisMonth()}, $1,250 over.`
		]);
	});

	it('warns when funding a Project takes Employee Pay with its commitments over its target', () => {
		const { payMe, warehouse } = courierAndLogistics();
		created(setAppropriation(payMe, leadership(), '10000', '2000-01'));
		created(setSpendingCategoryTarget(payMe, leadership(), 1, '15', new Date()));

		expect(warnings(fundProject(payMe, leadership(), warehouse.id, '400'))).toEqual([]);
		expect(
			warnings(fundProject(payMe, leadership(), warehouse.id, '200')).map((each) => each.type === 'private-reply' && each.card.description)
		).toEqual([
			`**Over target**: Employee Pay's Spent, Committed and Reserved now come to $1,600 of its $1,500 target for ${thisMonth()}, $100 over.`
		]);
	});

	it('never warns in a month with no Appropriation', () => {
		const { payMe, parcel, warehouse } = courierAndLogistics();
		approve(payMe, alex, parcel.id);
		const payout = created(generatePayout(payMe, leadership(), alex.userId));

		expect(warnings(markPayoutPaid(payMe, leadership(), payout.number, payout.revision))).toEqual([]);
		expect(warnings(fundProject(payMe, leadership(), warehouse.id, '1000000'))).toEqual([]);
		expect(warnings(createProject(payMe, leadership(), { name: 'Depot', jobId: warehouse.jobId, budget: '1000000' }))).toEqual([]);
	});
});

describe('Spending Category targets', () => {
	const october = new Date('2026-10-10T12:00:00Z');
	const rowsIn = (payMe: PayMe, month: string) => created(showAppropriation(payMe, leadership(), month, november)).categories;

	it('applies a target from the month it is set, leaving earlier months with the target they had', () => {
		const payMe = createTestPayMe();
		created(setAppropriation(payMe, leadership(), '5000', '2026-09'));
		created(setSpendingCategoryTarget(payMe, leadership(), 1, '60', october));
		created(setSpendingCategoryTarget(payMe, leadership(), 1, '12.5', november));

		expect(rowsIn(payMe, '2026-09')).toEqual([expect.objectContaining({ name: 'Employee Pay', targetPercent: null, target: null })]);
		expect(rowsIn(payMe, '2026-10')).toEqual([expect.objectContaining({ targetPercent: 6000, target: 300000 })]);
		expect(rowsIn(payMe, '2026-11')).toEqual([expect.objectContaining({ targetPercent: 1250, target: 62500 })]);
	});

	it('can be cleared, and shows no target in dollars in a month with no Appropriation', () => {
		const payMe = createTestPayMe();
		created(setSpendingCategoryTarget(payMe, leadership(), 1, '60', october));
		created(setSpendingCategoryTarget(payMe, leadership(), 1, '', november));

		expect(rowsIn(payMe, '2026-10')).toEqual([expect.objectContaining({ targetPercent: 6000, target: null })]);
		expect(rowsIn(payMe, '2026-11')).toEqual([expect.objectContaining({ targetPercent: null, target: null })]);
	});

	it('clears the target of a Category when it is Retired, leaving its earlier months alone', () => {
		const payMe = createTestPayMe();
		created(setAppropriation(payMe, leadership(), '5000', '2026-09'));
		const grants = created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));
		created(setSpendingCategoryTarget(payMe, leadership(), grants.id, '60', october));
		created(retireSpendingCategory(payMe, leadership(), grants.id));

		expect(created(setSpendingCategoryTarget(payMe, leadership(), 1, '100', november))).toBeTruthy();
		expect(rowsIn(payMe, '2026-10').map((row) => [row.name, row.targetPercent])).toEqual([
			['Employee Pay', null],
			['Grants', 6000]
		]);
		expect(rowsIn(payMe, '2026-11').map((row) => row.name)).toEqual(['Employee Pay']);
	});

	it('shows an earlier month only the Categories that had a target or Spend then', () => {
		const payMe = createTestPayMe();
		created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));

		expect(rowsIn(payMe, '2026-10').map((row) => row.name)).toEqual(['Employee Pay']);
		expect(rowsIn(payMe, '2026-11').map((row) => row.name)).toEqual(['Employee Pay', 'Grants']);
	});

	it('leaves no cent over or under when target dollars round', () => {
		const payMe = createTestPayMe();
		created(setAppropriation(payMe, leadership(), '0.03', '2026-11'));
		created(setSpendingCategoryTarget(payMe, leadership(), 1, '50', november));

		const view = created(showAppropriation(payMe, leadership(), null, november));
		expect(view.categories[0].target! + view.unassigned.amount!).toBe(3);
	});

	it('refuses targets that would total over 100%, a percentage it cannot read, and anyone but Leadership', () => {
		const payMe = createTestPayMe();
		const grants = created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));
		created(setSpendingCategoryTarget(payMe, leadership(), 1, '60', november));
		created(setSpendingCategoryTarget(payMe, leadership(), grants.id, '40', november));

		expect(setSpendingCategoryTarget(payMe, leadership(), grants.id, '40.01', november)).toEqual({
			ok: false,
			error: { code: 'targets-over-100', total: 10001 }
		});
		for (const text of ['0', '101', '12.345', '50%', 'half'])
			expect(setSpendingCategoryTarget(payMe, leadership(), 1, text, november)).toMatchObject({ error: { code: 'invalid-percent' } });
		expect(setSpendingCategoryTarget(payMe, member('user-casey'), 1, '10', november)).toMatchObject({ error: { code: 'not-permitted' } });
		expect(setSpendingCategoryTarget(payMe, leadership(), 99, '10', november)).toMatchObject({ error: { code: 'spending-category-not-found' } });
	});

	it('flags a Category whose Spent is over its target, and shows what no target covers', () => {
		const { payMe, parcel } = courierAndLogistics();
		created(setAppropriation(payMe, leadership(), '5000', '2026-11'));
		created(setSpendingCategoryTarget(payMe, leadership(), 1, '10', november));
		const grants = created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));
		created(setSpendingCategoryTarget(payMe, leadership(), grants.id, '30', november));
		created(addSpendingCategory(payMe, leadership(), { name: 'Events', jobIds: [] }));
		approve(payMe, alex, parcel.id);
		paidAt(payMe, alex, '2026-11-02T10:00:00.000Z');

		const shown = showAppropriation(payMe, leadership(), null, november);
		expect(created(shown)).toMatchObject({
			categories: [
				{ name: 'Employee Pay', targetPercent: 1000, target: 50000, spent: 100000, committed: 0, overTarget: true },
				{ name: 'Events', targetPercent: null, target: null, spent: 0, committed: 0, overTarget: false },
				{ name: 'Grants', targetPercent: 3000, target: 150000, spent: 0, committed: 0, overTarget: false }
			],
			unassigned: { percent: 6000, amount: 300000 }
		});
		expect(shown).toMatchObject({
			effects: [
				{
					card: {
						description: expect.stringContaining(
							[
								'**Spending Categories**',
								'- Employee Pay: target 10% ($500) · Spent $1,000 · Committed $0 · Reserved $1,000 · **over target**',
								'- Events: no target · Spent $0 · Committed $0',
								'- Grants: target 30% ($1,500) · Spent $0 · Committed $0',
								'- Unassigned: 60% ($3,000)'
							].join('\n')
						)
					}
				}
			]
		});
	});
});

describe('Disbursements in the Appropriation', () => {
	/** $5,000 from September. Grants draws on no Job; Leadership asks for D-1 ($500, paid on 1 November after being requested in October) and D-2 ($200, still Requested). */
	function grantsMonths() {
		const payMe = createTestPayMe();
		created(setAppropriation(payMe, leadership(), '5000', '2026-09'));
		const grants = created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));
		const ask = (recipient: string, amount: string) =>
			created(requestDisbursement(payMe, leadership(), { categoryId: grants.id, recipient, amount, reason: 'Grant', link: null }));
		const first = ask('Bakery_Bob', '500');
		created(markDisbursementPaid(payMe, leadership(), first.number));
		const sql = payMe.storage.db.$client;
		sql.prepare('UPDATE disbursements SET requested_at = ?, settled_at = ? WHERE number = ?').run(
			'2026-10-20T10:00:00.000Z',
			'2026-11-01T00:00:00.000Z',
			first.number
		);
		ask('Stage_Co', '200');
		return { payMe, grants };
	}

	it('counts a Paid Disbursement as Spend in its Category in the month it was paid, not the month it was requested', () => {
		const { payMe } = grantsMonths();
		const view = (month: string) => created(showAppropriation(payMe, leadership(), month, november));

		expect(view('2026-10')).toMatchObject({ spent: 0, categories: [{ name: 'Employee Pay', spent: 0 }] });
		expect(view('2026-11')).toMatchObject({
			spent: 50000,
			committed: 20000,
			remaining: 450000,
			remainingAfterCommitted: 430000,
			categories: [
				{ name: 'Employee Pay', spent: 0, committed: 0 },
				{ name: 'Grants', spent: 50000, committed: 20000 }
			]
		});
	});

	it('reports Paid Disbursements in items.csv and summary.csv, with totals matching /appropriation', () => {
		const { payMe } = grantsMonths();
		const report = created(appropriationReport(payMe, leadership(), '2026-11', '2026-11', november));

		expect(report.items.split('\n')).toEqual([
			'date_paid,month,spending_category,job,task_or_project,recipient,amount,requested_by,paid_by,reference,payout',
			'2026-11-01,2026-11,Grants,,,Bakery_Bob,500,user-leadership,user-leadership,D-1,',
			''
		]);
		expect(report.summary.split('\n')).toEqual([
			'month,spending_category,job,appropriation,target,spent,over_under',
			'2026-11,,,5000,,500,-4500',
			'2026-11,Employee Pay,,,,0,',
			'2026-11,Grants,,,,500,',
			''
		]);
	});

	it("lists the month's Disbursements by date: those paid or decided in it, and those still Requested in the current month", () => {
		const { payMe, grants } = grantsMonths();
		created(declineDisbursement(payMe, leadership(), 2, 'Not this month'));
		const sql = payMe.storage.db.$client;
		sql.prepare('UPDATE disbursements SET requested_at = ?, settled_at = ? WHERE number = 2').run(
			'2026-11-05T10:00:00.000Z',
			'2026-11-06T10:00:00.000Z'
		);
		created(requestDisbursement(payMe, leadership(), { categoryId: grants.id, recipient: 'Old_Ask', amount: '50', reason: 'Grant', link: null }));
		sql.prepare('UPDATE disbursements SET requested_at = ? WHERE number = 3').run('2026-10-02T10:00:00.000Z');

		expect(appropriationDisbursements(payMe, leadership(), '2026-11', november)).toMatchObject({
			effects: [
				{
					type: 'private-reply',
					card: {
						title: 'Disbursements · November 2026',
						description: [
							'- **D-3** Grants · Old_Ask · $50 · Requested',
							'- **D-1** Grants · Bakery_Bob · $500 · Paid',
							'- **D-2** Grants · Stage_Co · $200 · Declined'
						].join('\n')
					}
				}
			]
		});
		expect(appropriationDisbursements(payMe, leadership(), '2026-10', november)).toMatchObject({
			effects: [{ card: { description: 'No Disbursements.' } }]
		});
		expect(appropriationDisbursements(payMe, member('user-casey'), '2026-11', november)).toEqual({ ok: false, error: { code: 'not-permitted' } });
	});

	it('keeps a Retired Category with Requested Disbursements in the current month, so its rows add up to Committed', () => {
		const { payMe } = grantsMonths();
		const events = created(addSpendingCategory(payMe, leadership(), { name: 'Events', jobIds: [] }));
		created(
			requestDisbursement(payMe, leadership(), { categoryId: events.id, recipient: 'Stage_Co', amount: '75', reason: 'Stage', link: null })
		);
		created(retireSpendingCategory(payMe, leadership(), events.id));

		const view = created(showAppropriation(payMe, leadership(), '2026-11', november));
		expect(view.categories.map((row) => [row.name, row.committed])).toEqual([
			['Employee Pay', 0],
			['Events', 7500],
			['Grants', 20000]
		]);
	});

	it('counts Requested Disbursements when warning that funding a Project goes over', () => {
		const { payMe, warehouse } = courierAndLogistics();
		created(setAppropriation(payMe, leadership(), '1500', '2000-01'));
		const grants = created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));
		created(
			requestDisbursement(payMe, leadership(), { categoryId: grants.id, recipient: 'Bakery_Bob', amount: '400', reason: 'Grant', link: null })
		);

		const funded = fundProject(payMe, leadership(), warehouse.id, '200');
		expect(
			funded.ok && funded.effects.some((effect) => effect.type === 'private-reply' && effect.card.description?.includes('$1,600 of its $1,500'))
		).toBe(true);
	});

	it('warns when marking a Disbursement paid takes its Category over its target or the month over its Appropriation, and still pays it', () => {
		const payMe = createTestPayMe();
		created(setAppropriation(payMe, leadership(), '600', '2000-01'));
		const grants = created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));
		created(setSpendingCategoryTarget(payMe, leadership(), grants.id, '50', new Date()));
		const ask = (amount: string) =>
			created(
				requestDisbursement(payMe, leadership(), { categoryId: grants.id, recipient: 'Bakery_Bob', amount, reason: 'Grant', link: null })
			);
		const descriptions = (outcome: Outcome<unknown>) =>
			outcome.ok
				? outcome.effects.flatMap((effect) =>
						effect.type === 'private-reply' && effect.card.tone === 'warning' ? [effect.card.description] : []
					)
				: [];
		const month = monthName(monthOf(new Date()));

		expect(descriptions(markDisbursementPaid(payMe, leadership(), ask('500').number))).toEqual([
			`**Over target**: Grants has spent $500 of its $300 target for ${month}, $200 over.`
		]);
		const second = markDisbursementPaid(payMe, leadership(), ask('200').number);
		expect(descriptions(second)).toEqual([
			`**Over the Appropriation**: ${month} has spent $700 of its $600, $100 over.`,
			`**Over target**: Grants has spent $700 of its $300 target for ${month}, $400 over.`
		]);
		expect(second).toMatchObject({ ok: true, value: { state: 'paid' } });
	});
});
