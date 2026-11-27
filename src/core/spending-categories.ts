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
import { selectAppropriationFor } from '../storage/appropriations';
import type { Actor } from './actor';
import { monthName, monthOf } from './months';
import { notice } from './effects';
import { getJob } from './jobs';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { requireLeadership } from './permissions';
import { formatAmount, formatPercent, parsePercent, parseRate, wholePercent } from './rates';

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
		// A Retired Category takes no new Spend, so its target stops counting toward the Appropriation from this month.
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

/** A share of the Appropriation: `percent` in hundredths of a percent, or a fixed `amount` in cents. */
export type Target = { kind: 'percent'; value: number } | { kind: 'amount'; value: number };

/** What Leadership typed into the target form: at most one of them filled. */
export interface TargetInput {
	percent: string;
	amount?: string;
}

/** Each Category's target in `month`. Categories without one are left out. */
export function spendingCategoryTargets(payMe: PayMe, month: string): Map<number, Target> {
	return selectSpendingCategoryTargets(payMe.storage, month);
}

/** The Category's target this month. */
export function targetThisMonth(payMe: PayMe, id: number): Target | null {
	return spendingCategoryTargets(payMe, monthOf(new Date())).get(id) ?? null;
}

/** The targets given as percentages, in hundredths of a percent, and those given as amounts, in cents. */
export function totalTargets(targets: Iterable<Target>): { percent: number; amount: number } {
	const totals = { percent: 0, amount: 0 };
	for (const target of targets) totals[target.kind] += target.value;
	return totals;
}

/** The target in cents, when it is an amount or the month has an Appropriation. */
export function targetDollars(target: Target | null, appropriation: number | null): number | null {
	if (!target) return null;
	if (target.kind === 'amount') return target.value;
	return appropriation === null ? null : Math.round((appropriation * target.value) / wholePercent);
}

export function formatTarget(target: Target): string {
	return target.kind === 'percent' ? formatPercent(target.value) : formatAmount(target.value);
}

/** Sets the Category's share of the Appropriation from this month onward, as a percentage or an amount; both empty clears it. */
export function setSpendingCategoryTarget(payMe: PayMe, actor: Actor, id: number, input: TargetInput, now = new Date()): Outcome<SpendingCategory> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const target = parseTarget(input);
	if (target && 'ok' in target) return target;

	const { storage } = payMe;
	const month = monthOf(now);
	return storage.transaction(() => {
		const category = selectSpendingCategory(storage, id);
		if (!category) return fail({ code: 'spending-category-not-found' });
		const targets = selectSpendingCategoryTargets(storage, month);
		targets.delete(id);
		const total = totalTargets(target ? [...targets.values(), target] : targets.values());
		if (total.percent > wholePercent) return fail({ code: 'targets-over-100', total: total.percent });
		const appropriation = selectAppropriationFor(storage, month);
		const assigned = total.amount + (targetDollars({ kind: 'percent', value: total.percent }, appropriation) ?? 0);
		if (appropriation !== null && total.amount > 0 && assigned > appropriation)
			return fail({ code: 'targets-over-appropriation', total: assigned, appropriation });

		insertSpendingCategoryTarget(storage, id, month, target, actor.userId);
		const text = !target
			? 'has no target'
			: `has a target of ${formatTarget(target)}${target.kind === 'percent' ? ' of the Appropriation' : ' a month'}`;
		return succeed([{ type: 'private-reply', card: notice(`${category.name} ${text} from ${monthName(month)}.`) }], category);
	});
}

function parseTarget(input: TargetInput): Target | Failure | null {
	const percentText = input.percent.trim();
	const amountText = (input.amount ?? '').trim();
	if (percentText && amountText) return fail({ code: 'target-percent-and-amount' });
	if (percentText) {
		const value = parsePercent(percentText);
		return value === null ? fail({ code: 'invalid-percent', percent: percentText }) : { kind: 'percent', value };
	}
	if (!amountText) return null;
	const value = parseRate(amountText);
	return value === null ? fail({ code: 'invalid-amount', amount: amountText }) : { kind: 'amount', value };
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
