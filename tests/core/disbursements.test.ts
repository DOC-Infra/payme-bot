import { describe, expect, it } from 'vitest';
import {
	addSpendingCategory,
	createJob,
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
