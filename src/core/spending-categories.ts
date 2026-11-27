import {
	insertSpendingCategory,
	insertSpendingCategoryTarget,
	replaceSpendingCategoryJobs,
	selectSpendingCategories,
	selectSpendingCategory,
	selectSpendingCategoryIdByName,
	selectSpendingCategoryTargets,
	setSpendingCategoryRetired,
	updateSpendingCategoryName
} from '../storage/spendingCategories';
import type { Actor } from './actor';
import { monthName, monthOf } from './months';
import { notice } from './effects';
import { getJob } from './jobs';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { requireLeadership } from './permissions';
import { formatPercent, parsePercent, wholePercent } from './rates';

export interface SpendingCategory {
	id: number;
	name: string;
	/** Employee Pay: every Payout and Share counts here, and it can't be renamed, given Jobs or Retired. */
	builtIn: boolean;
	retired: boolean;
	/** The Jobs whose Employees and Managers may request Disbursements from it. */
	jobIds: number[];
}

/** Employee Pay's id: its row is added by the migration that creates Spending Categories. */
export const employeePayId = 1;

export interface NewSpendingCategory {
	name: string;
	jobIds: readonly number[];
}

export function getSpendingCategory(payMe: PayMe, id: number): SpendingCategory | null {
	return selectSpendingCategory(payMe.storage, id);
}

export function allSpendingCategories(payMe: PayMe): SpendingCategory[] {
	return selectSpendingCategories(payMe.storage);
}

export function addSpendingCategory(payMe: PayMe, actor: Actor, input: NewSpendingCategory): Outcome<SpendingCategory> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const name = input.name.trim();

	const { storage } = payMe;
	return storage.transaction(() => {
		const unusable = checkName(payMe, name) ?? checkJobs(payMe, input.jobIds);
		if (unusable) return unusable;

		const category = selectSpendingCategory(storage, insertSpendingCategory(storage, name, [...new Set(input.jobIds)]))!;
		return succeed([{ type: 'private-reply', card: notice(`Added the ${category.name} Spending Category.`) }], category);
	});
}

/** Renames the Category and makes these the active Jobs that may draw on it, keeping any Retired Jobs it already lists. */
export function editSpendingCategory(payMe: PayMe, actor: Actor, id: number, changes: NewSpendingCategory): Outcome<SpendingCategory> {
	const name = changes.name.trim();
	return changeSpendingCategory(payMe, actor, id, (category) => {
		const unusable = checkName(payMe, name, id) ?? checkJobs(payMe, changes.jobIds);
		if (unusable) return unusable;

		const retiredJobIds = category.jobIds.filter((jobId) => getJob(payMe, jobId)?.retired !== false);
		updateSpendingCategoryName(payMe.storage, id, name);
		replaceSpendingCategoryJobs(payMe.storage, id, [...new Set([...changes.jobIds, ...retiredJobIds])]);
		return `Saved the ${name} Spending Category.`;
	});
}

export function retireSpendingCategory(payMe: PayMe, actor: Actor, id: number): Outcome<SpendingCategory> {
	return changeSpendingCategory(payMe, actor, id, (category) => {
		const month = monthOf(new Date());
		setSpendingCategoryRetired(payMe.storage, id, true);
		// A Retired Category takes no new Spend, so its target stops counting toward 100% from this month.
		if (selectSpendingCategoryTargets(payMe.storage, month).has(id)) insertSpendingCategoryTarget(payMe.storage, id, month, null, actor.userId);
		return `Retired the ${category.name} Spending Category.`;
	});
}

/** Makes a Retired Category usable again, with the name and Jobs it had. */
export function restoreSpendingCategory(payMe: PayMe, actor: Actor, id: number): Outcome<SpendingCategory> {
	return changeSpendingCategory(payMe, actor, id, (category) => {
		if (!category.retired) return fail({ code: 'spending-category-not-retired', name: category.name });
		setSpendingCategoryRetired(payMe.storage, id, false);
		return `Restored the ${category.name} Spending Category.`;
	});
}

/** Each Category's target in `month`, in hundredths of a percent. Categories without one are left out. */
export function spendingCategoryTargets(payMe: PayMe, month: string): Map<number, number> {
	return selectSpendingCategoryTargets(payMe.storage, month);
}

/** The Category's target this month, in hundredths of a percent. */
export function targetThisMonth(payMe: PayMe, id: number): number | null {
	return spendingCategoryTargets(payMe, monthOf(new Date())).get(id) ?? null;
}

export function totalTarget(targets: ReadonlyMap<number, number>): number {
	return [...targets.values()].reduce((sum, percent) => sum + percent, 0);
}

/** Sets the Category's share of the Appropriation from this month onward; empty text clears it. Earlier months keep theirs. */
export function setSpendingCategoryTarget(payMe: PayMe, actor: Actor, id: number, percentText: string, now = new Date()): Outcome<SpendingCategory> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const cleared = percentText.trim() === '';
	const percent = cleared ? null : parsePercent(percentText);
	if (!cleared && percent === null) return fail({ code: 'invalid-percent', percent: percentText });

	const { storage } = payMe;
	const month = monthOf(now);
	return storage.transaction(() => {
		const category = selectSpendingCategory(storage, id);
		if (!category) return fail({ code: 'spending-category-not-found' });
		const others = selectSpendingCategoryTargets(storage, month);
		others.delete(id);
		const total = totalTarget(others) + (percent ?? 0);
		if (total > wholePercent) return fail({ code: 'targets-over-100', total });

		insertSpendingCategoryTarget(storage, id, month, percent, actor.userId);
		const target = percent === null ? 'has no target' : `has a target of ${formatPercent(percent)} of the Appropriation`;
		return succeed([{ type: 'private-reply', card: notice(`${category.name} ${target} from ${monthName(month)}.`) }], category);
	});
}

function changeSpendingCategory(
	payMe: PayMe,
	actor: Actor,
	id: number,
	change: (category: SpendingCategory) => Failure | string
): Outcome<SpendingCategory> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		const category = selectSpendingCategory(storage, id);
		if (!category) return fail({ code: 'spending-category-not-found' });
		if (category.builtIn) return fail({ code: 'spending-category-built-in', name: category.name });

		const result = change(category);
		if (typeof result !== 'string') return result;
		return succeed([{ type: 'private-reply', card: notice(result) }], selectSpendingCategory(storage, id)!);
	});
}

function checkName(payMe: PayMe, name: string, exceptId?: number): Failure | null {
	if (!name) return fail({ code: 'spending-category-name-required' });
	const takenBy = selectSpendingCategoryIdByName(payMe.storage, name);
	if (takenBy === null || takenBy === exceptId) return null;
	return fail({ code: 'spending-category-name-taken', name, retired: getSpendingCategory(payMe, takenBy)!.retired });
}

function checkJobs(payMe: PayMe, jobIds: readonly number[]): Failure | null {
	for (const jobId of jobIds) {
		const job = getJob(payMe, jobId);
		if (!job) return fail({ code: 'job-not-found' });
		if (job.retired) return fail({ code: 'job-retired', name: job.name });
	}
	return null;
}
