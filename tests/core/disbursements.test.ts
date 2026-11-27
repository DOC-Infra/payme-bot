import { describe, expect, it } from 'vitest';
import {
	addSpendingCategory,
	setAppropriation,
	createJob,
	showAppropriation,
	voidDisbursement,
	checkDisbursementChange,
	declineDisbursement,
	markDisbursementPaid,
	showDisbursement,
	showPayouts,
	discardUnpostedDisbursement,
	getDisbursement,
	recordDisbursementCard,
	requestableCategories,
	hireEmployee,
	requestDisbursement,
	retireSpendingCategory,
	setManagerRoles,
	withdrawDisbursement,
	type NewDisbursement,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const grantsOfficer = member('user-alex', 'role-grants');

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

function job(payMe: PayMe, name: string) {
	const slug = name.toLowerCase();
	const made = created(createJob(payMe, leadership(), { name, employeeRoleId: `role-${slug}`, reviewChannelId: `review-${slug}` }));
	setManagerRoles(payMe, leadership(), made.id, [`role-${slug}-manager`], []);
	return made;
}

/** The Grants Office and Commerce Jobs, and a Small Business Grants Category that both may draw on. */
function grantsOffice() {
	const payMe = createTestPayMe();
	const grants = job(payMe, 'Grants');
	const commerce = job(payMe, 'Commerce');
	const category = created(addSpendingCategory(payMe, leadership(), { name: 'Small Business Grants', jobIds: [grants.id, commerce.id] }));
	return { payMe, grants, commerce, category };
}

function grant(categoryId: number, changes: Partial<NewDisbursement> = {}): NewDisbursement {
	return { categoryId, recipient: 'Bakery_Bob', amount: '2500', reason: 'Opening a bakery', link: null, ...changes };
}

describe('Requesting a Disbursement', () => {
	it('records it as Requested under the Job it was asked for, and posts its card with a Withdraw button', () => {
		const { payMe, grants, category } = grantsOffice();

		const requested = requestDisbursement(payMe, grantsOfficer, grant(category.id, { link: 'https://forum.example/bakery' }));

		expect(created(requested)).toMatchObject({
			number: 1,
			categoryId: category.id,
			jobId: grants.id,
			recipient: 'Bakery_Bob',
			amount: 250000,
			reason: 'Opening a bakery',
			link: 'https://forum.example/bakery',
			state: 'requested',
			requestedBy: 'user-alex'
		});
		expect(requested).toMatchObject({
			effects: [
				{
					type: 'post-disbursement',
					disbursementNumber: 1,
					actions: ['withdraw'],
					card: {
						tone: 'info',
						title: 'D-1 · Small Business Grants',
						fields: [
							{ name: 'Recipient', value: 'Bakery_Bob', inline: true },
							{ name: 'Amount', value: '$2,500', inline: true },
							{ name: 'Requested by', value: '<@user-alex> (Grants)', inline: true },
							{ name: 'Reason', value: 'Opening a bakery' },
							{ name: 'Link', value: 'https://forum.example/bakery' },
							{ name: 'State', value: '**Requested**' }
						]
					}
				}
			]
		});
	});

	it('sets the Job from the role the requester holds or manages, and asks which when more than one may draw on it', () => {
		const { payMe, grants, commerce, category } = grantsOffice();
		const both = member('user-bo', 'role-grants', 'role-commerce');

		expect(created(requestDisbursement(payMe, member('user-cy', 'role-commerce'), grant(category.id))).jobId).toBe(commerce.id);
		expect(created(requestDisbursement(payMe, member('user-di', 'role-grants-manager'), grant(category.id))).jobId).toBe(grants.id);
		expect(requestDisbursement(payMe, both, grant(category.id))).toEqual({
			ok: false,
			error: { code: 'disbursement-job-required', category: 'Small Business Grants' }
		});
		expect(created(requestDisbursement(payMe, both, grant(category.id, { jobId: commerce.id }))).jobId).toBe(commerce.id);
	});

	it('lets Leadership request from any active Category, under no Job when they hold none of its Jobs, or under any of its Jobs', () => {
		const { payMe, grants, category } = grantsOffice();
		const events = created(addSpendingCategory(payMe, leadership(), { name: 'Events', jobIds: [] }));

		expect(created(requestDisbursement(payMe, leadership(), grant(category.id))).jobId).toBeNull();
		expect(created(requestDisbursement(payMe, leadership(), grant(events.id))).jobId).toBeNull();
		expect(created(requestDisbursement(payMe, leadership(), grant(category.id, { jobId: grants.id }))).jobId).toBe(grants.id);
	});

	it('refuses anyone outside the Category, a Job they cannot request under, Employee Pay and Retired Categories', () => {
		const { payMe, category } = grantsOffice();
		const archive = created(addSpendingCategory(payMe, leadership(), { name: 'Archive', jobIds: [] }));
		created(retireSpendingCategory(payMe, leadership(), archive.id));
		const other = job(payMe, 'Couriers');

		expect(requestDisbursement(payMe, member('user-ed', 'role-couriers'), grant(category.id))).toEqual({
			ok: false,
			error: { code: 'disbursement-not-allowed', category: 'Small Business Grants' }
		});
		expect(requestDisbursement(payMe, grantsOfficer, grant(category.id, { jobId: other.id }))).toMatchObject({
			error: { code: 'disbursement-not-allowed' }
		});
		expect(requestDisbursement(payMe, leadership(), grant(1))).toEqual({
			ok: false,
			error: { code: 'spending-category-unavailable', name: 'Employee Pay' }
		});
		expect(requestDisbursement(payMe, leadership(), grant(archive.id))).toMatchObject({
			error: { code: 'spending-category-unavailable', name: 'Archive' }
		});
	});

	it('refuses a requester naming their own Minecraft Name, unless they are Leadership', () => {
		const { payMe, category } = grantsOffice();
		created(hireEmployee(payMe, leadership(), grantsOfficer, 'Alex_42'));
		created(hireEmployee(payMe, leadership(), leadership(), 'Lead_1'));

		expect(requestDisbursement(payMe, grantsOfficer, grant(category.id, { recipient: 'alex_42' }))).toEqual({
			ok: false,
			error: { code: 'own-disbursement' }
		});
		expect(requestDisbursement(payMe, leadership(), grant(category.id, { recipient: 'Lead_1' }))).toMatchObject({ ok: true });
	});

	it('refuses a recipient, amount, reason or link it cannot use', () => {
		const { payMe, category } = grantsOffice();

		expect(requestDisbursement(payMe, grantsOfficer, grant(category.id, { recipient: 'Bad Name!' }))).toMatchObject({
			error: { code: 'invalid-minecraft-name' }
		});
		expect(requestDisbursement(payMe, grantsOfficer, grant(category.id, { amount: '$25' }))).toMatchObject({ error: { code: 'invalid-amount' } });
		expect(requestDisbursement(payMe, grantsOfficer, grant(category.id, { reason: '  ' }))).toMatchObject({ error: { code: 'reason-required' } });
		expect(requestDisbursement(payMe, grantsOfficer, grant(category.id, { link: 'forum.example' }))).toMatchObject({
			error: { code: 'invalid-link' }
		});
	});
});

describe('Withdrawing a Disbursement', () => {
	it('lets the requester withdraw it while Requested, editing its card to show who did', () => {
		const { payMe, category } = grantsOffice();
		const requested = created(requestDisbursement(payMe, grantsOfficer, grant(category.id)));

		const withdrawn = withdrawDisbursement(payMe, grantsOfficer, requested.number);

		expect(withdrawn).toMatchObject({
			ok: true,
			value: { state: 'withdrawn', settledBy: 'user-alex' },
			effects: [
				{
					type: 'update-disbursement',
					disbursementNumber: 1,
					actions: [],
					card: { tone: 'neutral', fields: expect.arrayContaining([{ name: 'State', value: '**Withdrawn** by <@user-alex>' }]) }
				}
			]
		});
		expect(withdrawn.ok && withdrawn.effects).toHaveLength(1);
	});

	it("lets Leadership withdraw anyone's, and refuses others or one no longer Requested", () => {
		const { payMe, category } = grantsOffice();
		const first = created(requestDisbursement(payMe, grantsOfficer, grant(category.id)));
		const colleague = member('user-cy', 'role-grants');

		expect(withdrawDisbursement(payMe, colleague, first.number)).toEqual({ ok: false, error: { code: 'not-your-disbursement' } });
		created(withdrawDisbursement(payMe, leadership(), first.number));
		expect(withdrawDisbursement(payMe, grantsOfficer, first.number)).toEqual({
			ok: false,
			error: { code: 'cannot-withdraw-disbursement', number: 1, state: 'withdrawn' }
		});
		expect(withdrawDisbursement(payMe, leadership(), 99)).toEqual({ ok: false, error: { code: 'disbursement-not-found' } });
	});
});

describe('The public card', () => {
	it('is remembered once posted, so later changes edit it', () => {
		const { payMe, category } = grantsOffice();
		const requested = created(requestDisbursement(payMe, grantsOfficer, grant(category.id)));

		recordDisbursementCard(payMe, requested.number, { channelId: 'thread-grants', messageId: 'message-1' });

		expect(getDisbursement(payMe, requested.number)).toMatchObject({ channelId: 'thread-grants', messageId: 'message-1' });
	});
});

describe('Categories a requester can pick', () => {
	it('lists the active Categories drawn on by a Job they hold or manage, or every active one for Leadership', () => {
		const { payMe, category } = grantsOffice();
		const events = created(addSpendingCategory(payMe, leadership(), { name: 'Events', jobIds: [] }));

		expect(requestableCategories(payMe, grantsOfficer).map((each) => each.id)).toEqual([category.id]);
		expect(requestableCategories(payMe, member('user-ed')).map((each) => each.id)).toEqual([]);
		expect(requestableCategories(payMe, leadership()).map((each) => each.id)).toEqual([events.id, category.id]);
	});
});

describe('A card that could not be posted', () => {
	it('discards its Disbursement, so nothing is left that nobody can see or withdraw', () => {
		const { payMe, category } = grantsOffice();
		const unposted = created(requestDisbursement(payMe, grantsOfficer, grant(category.id)));
		const posted = created(requestDisbursement(payMe, grantsOfficer, grant(category.id)));
		recordDisbursementCard(payMe, posted.number, { channelId: 'thread-grants', messageId: 'message-2' });

		discardUnpostedDisbursement(payMe, unposted.number);
		discardUnpostedDisbursement(payMe, posted.number);

		expect(getDisbursement(payMe, unposted.number)).toBeNull();
		expect(getDisbursement(payMe, posted.number)).toMatchObject({ state: 'requested' });
	});
});

describe('Paying and declining from /payouts', () => {
	it('lists Requested Disbursements by Spending Category for Leadership, with a button to open each', () => {
		const { payMe, category } = grantsOffice();
		const events = created(addSpendingCategory(payMe, leadership(), { name: 'Events', jobIds: [] }));
		created(requestDisbursement(payMe, grantsOfficer, grant(category.id)));
		created(requestDisbursement(payMe, leadership(), grant(events.id, { recipient: 'Stage_Co', amount: '300', reason: 'Stage hire' })));
		const withdrawn = created(requestDisbursement(payMe, grantsOfficer, grant(category.id)));
		created(withdrawDisbursement(payMe, grantsOfficer, withdrawn.number));

		expect(showPayouts(payMe, leadership(), [])).toMatchObject({
			effects: [
				{
					card: {
						description: expect.stringContaining(
							[
								'**Disbursements**',
								'__Events__',
								'- **D-2** to Stage_Co: $300 (Stage hire)',
								'__Small Business Grants__',
								'- **D-1** to Bakery_Bob: $2,500 (Opening a bakery)'
							].join('\n')
						)
					},
					actions: [
						{ kind: 'disbursement', disbursementNumber: 2, label: 'D-2 to Stage_Co' },
						{ kind: 'disbursement', disbursementNumber: 1, label: 'D-1 to Bakery_Bob' }
					]
				}
			]
		});
	});

	it('shows no Disbursements to a Manager looking at /payouts', () => {
		const { payMe, category } = grantsOffice();
		created(requestDisbursement(payMe, grantsOfficer, grant(category.id)));

		const outcome = showPayouts(payMe, member('user-di', 'role-grants-manager'), []);
		expect(outcome.ok && outcome.effects[0].type === 'show-payouts' && outcome.effects[0].card.description).not.toContain('D-1');
	});

	it('opens a Disbursement privately with its Pay Command and buttons to mark it paid or decline it', () => {
		const { payMe, category } = grantsOffice();
		created(requestDisbursement(payMe, grantsOfficer, grant(category.id, { amount: '2500.5' })));

		expect(showDisbursement(payMe, leadership(), 1)).toMatchObject({
			effects: [
				{
					type: 'show-disbursement',
					disbursementNumber: 1,
					actions: ['paid', 'decline'],
					card: {
						fields: expect.arrayContaining([
							{ name: 'Pay Command', value: '```\n/gov payout GovCommerce Bakery_Bob 2500.5 Small Business Grants\n```' }
						])
					}
				}
			]
		});
		expect(showDisbursement(payMe, grantsOfficer, 1)).toEqual({ ok: false, error: { code: 'not-permitted' } });
	});

	it('marks it paid, recording who and when, edits the public card in place, and then offers Void', () => {
		const { payMe, category } = grantsOffice();
		created(requestDisbursement(payMe, grantsOfficer, grant(category.id)));

		const paid = markDisbursementPaid(payMe, leadership(), 1);

		expect(paid).toMatchObject({
			ok: true,
			value: { state: 'paid', settledBy: 'user-leadership', settledAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) },
			effects: [
				{
					type: 'update-disbursement',
					actions: [],
					card: {
						tone: 'success',
						fields: expect.arrayContaining([
							{ name: 'State', value: expect.stringMatching(/^\*\*Paid\*\* by <@user-leadership> on \d{4}-\d{2}-\d{2}$/) }
						])
					}
				},
				{ type: 'show-disbursement', actions: ['void'] }
			]
		});
	});

	it('declines it with a required reason shown on the card', () => {
		const { payMe, category } = grantsOffice();
		created(requestDisbursement(payMe, grantsOfficer, grant(category.id)));

		expect(checkDisbursementChange(payMe, leadership(), 1, 'decline')).toBeNull();
		expect(declineDisbursement(payMe, leadership(), 1, '  ')).toEqual({ ok: false, error: { code: 'reason-required' } });
		expect(declineDisbursement(payMe, leadership(), 1, ' Already funded ')).toMatchObject({
			value: { state: 'declined', settledBy: 'user-leadership', outcomeReason: 'Already funded' },
			effects: [
				{
					type: 'update-disbursement',
					card: {
						tone: 'danger',
						fields: expect.arrayContaining([{ name: 'State', value: '**Declined** by <@user-leadership>: Already funded' }])
					}
				},
				{ type: 'show-disbursement', actions: [] }
			]
		});
	});

	it('refuses to pay or decline one no longer Requested, and anyone but Leadership', () => {
		const { payMe, category } = grantsOffice();
		created(requestDisbursement(payMe, grantsOfficer, grant(category.id)));
		created(withdrawDisbursement(payMe, grantsOfficer, 1));

		expect(markDisbursementPaid(payMe, leadership(), 1)).toEqual({
			ok: false,
			error: { code: 'disbursement-decided', number: 1, state: 'withdrawn' }
		});
		expect(declineDisbursement(payMe, leadership(), 1, 'No')).toMatchObject({ error: { code: 'disbursement-decided' } });
		expect(checkDisbursementChange(payMe, leadership(), 1, 'decline')).toEqual({
			ok: false,
			error: { code: 'disbursement-decided', number: 1, state: 'withdrawn' }
		});
		expect(checkDisbursementChange(payMe, grantsOfficer, 1, 'decline')).toEqual({ ok: false, error: { code: 'not-permitted' } });
		expect(markDisbursementPaid(payMe, member('user-di', 'role-grants-manager'), 1)).toEqual({ ok: false, error: { code: 'not-permitted' } });
		expect(declineDisbursement(payMe, grantsOfficer, 1, 'No')).toEqual({ ok: false, error: { code: 'not-permitted' } });
	});
});

describe('Recording a Disbursement already paid', () => {
	const november = new Date('2026-11-15T12:00:00Z');

	it('lets Leadership post its card already Paid on a past date, counting as Spend in that month', () => {
		const { payMe, category } = grantsOffice();
		created(setAppropriation(payMe, leadership(), '5000', '2026-09'));

		const recorded = requestDisbursement(payMe, leadership(), grant(category.id, { paidOn: '2026-10-15' }), november);

		expect(recorded).toMatchObject({
			value: { state: 'paid', settledBy: 'user-leadership', settledAt: '2026-10-15T00:00:00.000Z' },
			effects: [
				{
					type: 'post-disbursement',
					actions: [],
					card: {
						tone: 'success',
						fields: expect.arrayContaining([{ name: 'State', value: '**Paid** by <@user-leadership> on 2026-10-15' }])
					}
				}
			]
		});
		expect(created(showAppropriation(payMe, leadership(), '2026-10', november)).spent).toBe(250000);
		expect(created(showAppropriation(payMe, leadership(), '2026-11', november)).spent).toBe(0);
	});

	it('is discarded too when its card cannot be posted, so it never counts as Spend unseen', () => {
		const { payMe, category } = grantsOffice();
		created(requestDisbursement(payMe, leadership(), grant(category.id, { paidOn: '2026-10-15' }), november));

		discardUnpostedDisbursement(payMe, 1);

		expect(getDisbursement(payMe, 1)).toBeNull();
	});

	it('can be recorded from a Category Retired since, but never from Employee Pay', () => {
		const { payMe, category } = grantsOffice();
		created(retireSpendingCategory(payMe, leadership(), category.id));

		expect(requestDisbursement(payMe, leadership(), grant(category.id, { paidOn: '2026-10-15' }), november)).toMatchObject({ ok: true });
		expect(requestDisbursement(payMe, leadership(), grant(category.id), november)).toMatchObject({
			error: { code: 'spending-category-unavailable' }
		});
		expect(requestDisbursement(payMe, leadership(), grant(1, { paidOn: '2026-10-15' }), november)).toMatchObject({
			error: { code: 'spending-category-unavailable' }
		});
	});

	it('warns when a payment recorded for this month takes it over, but not for an earlier month', () => {
		const { payMe, category } = grantsOffice();
		created(setAppropriation(payMe, leadership(), '1000', '2000-01'));
		const today = new Date();
		const todayText = today.toISOString().slice(0, 10);
		const warned = (outcome: Outcome<unknown>) =>
			outcome.ok && outcome.effects.some((effect) => effect.type === 'private-reply' && effect.card.tone === 'warning');

		expect(warned(requestDisbursement(payMe, leadership(), grant(category.id, { paidOn: '2020-01-15' }), today))).toBe(false);
		expect(warned(requestDisbursement(payMe, leadership(), grant(category.id, { paidOn: todayText }), today))).toBe(true);
	});

	it('refuses a paid date from anyone but Leadership, or one in the future or that is not a real date', () => {
		const { payMe, category } = grantsOffice();

		expect(requestDisbursement(payMe, grantsOfficer, grant(category.id, { paidOn: '2026-10-15' }), november)).toEqual({
			ok: false,
			error: { code: 'not-permitted' }
		});
		for (const paidOn of ['2026-11-16', '2026-02-30', '1999-12-31', '15/10/2026'])
			expect(requestDisbursement(payMe, leadership(), grant(category.id, { paidOn }), november)).toEqual({
				ok: false,
				error: { code: 'invalid-paid-date', date: paidOn }
			});
		expect(requestDisbursement(payMe, leadership(), grant(category.id, { paidOn: '2026-11-15' }), november)).toMatchObject({ ok: true });
	});
});

describe('Voiding a Disbursement', () => {
	const november = new Date('2026-11-15T12:00:00Z');

	it('removes a Paid one from Spend in its month, even an earlier month, and shows who voided it and why', () => {
		const { payMe, category } = grantsOffice();
		created(requestDisbursement(payMe, leadership(), grant(category.id, { paidOn: '2026-10-15' }), november));

		expect(checkDisbursementChange(payMe, leadership(), 1, 'void')).toBeNull();
		const voided = voidDisbursement(payMe, leadership(), 1, ' Paid the wrong person ');

		expect(voided).toMatchObject({
			value: { state: 'voided', voidedBy: 'user-leadership', outcomeReason: 'Paid the wrong person', settledAt: '2026-10-15T00:00:00.000Z' },
			effects: [
				{
					type: 'update-disbursement',
					card: {
						tone: 'neutral',
						fields: expect.arrayContaining([{ name: 'State', value: '**Voided** by <@user-leadership>: Paid the wrong person' }])
					}
				},
				{ type: 'show-disbursement', actions: [] }
			]
		});
		expect(created(showAppropriation(payMe, leadership(), '2026-10', november)).spent).toBe(0);
	});

	it('voids only Paid Disbursements, only for Leadership, and only with a reason', () => {
		const { payMe, category } = grantsOffice();
		created(requestDisbursement(payMe, grantsOfficer, grant(category.id)));
		created(requestDisbursement(payMe, leadership(), grant(category.id, { paidOn: '2026-10-15' }), november));

		expect(voidDisbursement(payMe, leadership(), 1, 'No')).toEqual({ ok: false, error: { code: 'cannot-void', number: 1, state: 'requested' } });
		expect(checkDisbursementChange(payMe, leadership(), 1, 'void')).toMatchObject({ error: { code: 'cannot-void' } });
		expect(voidDisbursement(payMe, grantsOfficer, 2, 'No')).toEqual({ ok: false, error: { code: 'not-permitted' } });
		expect(voidDisbursement(payMe, leadership(), 2, ' ')).toEqual({ ok: false, error: { code: 'reason-required' } });
		expect(showDisbursement(payMe, leadership(), 2)).toMatchObject({ effects: [{ actions: ['void'] }] });
	});
});
