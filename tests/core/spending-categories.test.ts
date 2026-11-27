import { describe, expect, it } from 'vitest';
import {
	addSpendingCategory,
	allSpendingCategories,
	createJob,
	editSpendingCategory,
	restoreSpendingCategory,
	retireSpendingCategory,
	setSpendingCategoryTarget,
	retireJob,
	spendingCategoriesView,
	spendingCategoryView,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

function job(payMe: PayMe, name: string) {
	const slug = name.toLowerCase();
	return created(createJob(payMe, leadership(), { name, employeeRoleId: `role-${slug}`, reviewChannelId: `review-${slug}` }));
}

describe('Employee Pay', () => {
	it('exists on every server without setup, built in and with no Jobs', () => {
		const payMe = createTestPayMe();

		expect(allSpendingCategories(payMe)).toEqual([{ id: 1, name: 'Employee Pay', builtIn: true, retired: false, jobIds: [] }]);
	});
});

describe('Creating a Spending Category', () => {
	it('records its name and the Jobs that may request Disbursements from it', () => {
		const payMe = createTestPayMe();
		const grants = job(payMe, 'Grants Office');
		const commerce = job(payMe, 'Commerce');

		const category = created(addSpendingCategory(payMe, leadership(), { name: ' Small Business Grants ', jobIds: [grants.id, commerce.id] }));

		expect(category).toEqual({ id: 2, name: 'Small Business Grants', builtIn: false, retired: false, jobIds: [grants.id, commerce.id] });
		expect(allSpendingCategories(payMe).map((each) => each.name)).toEqual(['Employee Pay', 'Small Business Grants']);
	});

	it('refuses a name already taken, whatever its case, including Employee Pay', () => {
		const payMe = createTestPayMe();
		created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));

		expect(addSpendingCategory(payMe, leadership(), { name: 'grants', jobIds: [] })).toEqual({
			ok: false,
			error: { code: 'spending-category-name-taken', name: 'grants', retired: false }
		});
		expect(addSpendingCategory(payMe, leadership(), { name: 'EMPLOYEE PAY', jobIds: [] })).toMatchObject({
			error: { code: 'spending-category-name-taken' }
		});
	});

	it('refuses a blank name', () => {
		const payMe = createTestPayMe();
		const category = created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));

		expect(addSpendingCategory(payMe, leadership(), { name: '   ', jobIds: [] })).toEqual({
			ok: false,
			error: { code: 'spending-category-name-required' }
		});
		expect(editSpendingCategory(payMe, leadership(), category.id, { name: ' ', jobIds: [] })).toMatchObject({
			error: { code: 'spending-category-name-required' }
		});
	});

	it('refuses a Retired Job, and anyone but Leadership', () => {
		const payMe = createTestPayMe();
		const old = job(payMe, 'Old Office');
		created(retireJob(payMe, leadership(), old.id));

		expect(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [old.id] })).toMatchObject({ error: { code: 'job-retired' } });
		expect(addSpendingCategory(payMe, member('user-casey'), { name: 'Grants', jobIds: [] })).toEqual({
			ok: false,
			error: { code: 'not-permitted' }
		});
		expect(allSpendingCategories(payMe)).toHaveLength(1);
	});
});

describe('Editing a Spending Category', () => {
	it('renames it and changes its Jobs, keeping Retired Jobs it already had', () => {
		const payMe = createTestPayMe();
		const grants = job(payMe, 'Grants Office');
		const commerce = job(payMe, 'Commerce');
		const old = job(payMe, 'Old Office');
		const category = created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [grants.id, old.id] }));
		created(retireJob(payMe, leadership(), old.id));

		expect(
			created(editSpendingCategory(payMe, leadership(), category.id, { name: 'Small Business Grants', jobIds: [commerce.id] }))
		).toMatchObject({
			name: 'Small Business Grants',
			jobIds: [commerce.id, old.id]
		});
	});

	it('keeps its own name when only its case changes, and refuses another Category name', () => {
		const payMe = createTestPayMe();
		const category = created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));
		created(addSpendingCategory(payMe, leadership(), { name: 'Events', jobIds: [] }));

		expect(created(editSpendingCategory(payMe, leadership(), category.id, { name: 'GRANTS', jobIds: [] })).name).toBe('GRANTS');
		expect(editSpendingCategory(payMe, leadership(), category.id, { name: 'events', jobIds: [] })).toMatchObject({
			error: { code: 'spending-category-name-taken' }
		});
	});

	it('refuses to change Employee Pay, or a Category that does not exist', () => {
		const payMe = createTestPayMe();

		expect(editSpendingCategory(payMe, leadership(), 1, { name: 'Salaries', jobIds: [] })).toEqual({
			ok: false,
			error: { code: 'spending-category-built-in', name: 'Employee Pay' }
		});
		expect(editSpendingCategory(payMe, leadership(), 99, { name: 'Salaries', jobIds: [] })).toMatchObject({
			error: { code: 'spending-category-not-found' }
		});
	});
});

describe('Retiring and restoring a Spending Category', () => {
	it('keeps its name and Jobs while Retired, and restoring makes it usable again', () => {
		const payMe = createTestPayMe();
		const grants = job(payMe, 'Grants Office');
		const category = created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [grants.id] }));

		expect(created(retireSpendingCategory(payMe, leadership(), category.id))).toMatchObject({
			name: 'Grants',
			jobIds: [grants.id],
			retired: true
		});
		expect(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] })).toMatchObject({
			error: { code: 'spending-category-name-taken', retired: true }
		});
		expect(created(restoreSpendingCategory(payMe, leadership(), category.id))).toMatchObject({ jobIds: [grants.id], retired: false });
	});

	it('refuses to restore one that is not Retired, or to Retire Employee Pay', () => {
		const payMe = createTestPayMe();
		const category = created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));

		expect(restoreSpendingCategory(payMe, leadership(), category.id)).toEqual({
			ok: false,
			error: { code: 'spending-category-not-retired', name: 'Grants' }
		});
		expect(retireSpendingCategory(payMe, leadership(), 1)).toMatchObject({ error: { code: 'spending-category-built-in' } });
		const casey = member('user-casey');
		expect(retireSpendingCategory(payMe, casey, category.id)).toMatchObject({ error: { code: 'not-permitted' } });
		expect(restoreSpendingCategory(payMe, casey, category.id)).toMatchObject({ error: { code: 'not-permitted' } });
		expect(editSpendingCategory(payMe, casey, category.id, { name: 'Mine', jobIds: [] })).toMatchObject({ error: { code: 'not-permitted' } });
		expect(spendingCategoryView(payMe, casey, category.id)).toMatchObject({ error: { code: 'not-permitted' } });
	});
});

describe('Managing Spending Categories from the dashboard', () => {
	it('lists every Category with its Jobs and offers to open each, active ones first', () => {
		const payMe = createTestPayMe();
		const grants = job(payMe, 'Grants Office');
		const old = created(addSpendingCategory(payMe, leadership(), { name: 'Archive', jobIds: [] }));
		created(retireSpendingCategory(payMe, leadership(), old.id));
		created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [grants.id] }));

		expect(spendingCategoriesView(payMe, leadership())).toMatchObject({
			effects: [
				{
					type: 'show-manage',
					card: {
						title: 'Spending Categories',
						description: [
							'**Employee Pay** (built in): every Payout and Share',
							'**Archive** (retired): only Leadership can request',
							'**Grants**: Grants Office'
						].join('\n')
					},
					view: {
						kind: 'spending-categories',
						categories: [
							{ id: 1, label: 'Employee Pay' },
							{ id: 3, label: 'Grants' },
							{ id: 2, label: 'Archive (retired)' }
						]
					}
				}
			]
		});
	});

	it('offers Edit, Target and Retire on an active Category, Restore on a Retired one, and only Target on Employee Pay', () => {
		const payMe = createTestPayMe();
		const category = created(addSpendingCategory(payMe, leadership(), { name: 'Grants', jobIds: [] }));
		const actions = (id: number) => {
			const outcome = spendingCategoryView(payMe, leadership(), id);
			return outcome.ok && outcome.effects[0].type === 'show-manage' && outcome.effects[0].view.kind === 'spending-category'
				? outcome.effects[0].view.actions
				: null;
		};

		expect(actions(category.id)).toEqual(['edit', 'target', 'retire']);
		created(retireSpendingCategory(payMe, leadership(), category.id));
		expect(actions(category.id)).toEqual(['restore']);
		expect(actions(1)).toEqual(['target']);
		expect(spendingCategoriesView(payMe, member('user-casey'))).toEqual({ ok: false, error: { code: 'not-permitted' } });
	});
});

describe('A Spending Category with a target', () => {
	it('shows its target for this month', () => {
		const payMe = createTestPayMe();
		created(setSpendingCategoryTarget(payMe, leadership(), 1, '62.5'));

		expect(spendingCategoryView(payMe, leadership(), 1)).toMatchObject({
			effects: [{ card: { description: '**Employee Pay** (built in): every Payout and Share · target 62.5% this month' } }]
		});
	});
});
