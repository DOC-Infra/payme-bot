import { insertAppropriation, selectAppropriationFor } from '../storage/appropriations';
import type { Actor } from './actor';
import { notice, type Card, type Effect } from './effects';
import { fail, succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { requireLeadership } from './permissions';
import { getEmployee } from './employees';
import { getJob } from './jobs';
import { payoutLabel, requestLabel, shareLabel } from './labels';
import { owedSummary, paidPayouts, type Payout } from './payouts';
import { allProjects, balanceOf, getProject } from './projects';
import { getTask } from './tasks';
import { formatAmount, formatPercent, parseRate, plainAmount } from './rates';
import { allSpendingCategories, employeePayId, spendingCategoryTargets } from './spending-categories';

export interface AppropriationView {
	/** YYYY-MM, a calendar month in UTC. */
	month: string;
	appropriation: number | null;
	/** Payouts marked paid in the month (ADR 0002). */
	spent: number;
	spentByJob: JobSpend[];
	/** What paying everything owed today would cost; Approved requests are estimated at current Rates (ADR 0001). Only for the current month. */
	committed: number | null;
	/** The part of `committed` that is only an estimate. */
	committedEstimate: number | null;
	/** Open Projects' money not yet given as Shares. Only for the current month. */
	reserved: number | null;
	remaining: number | null;
	remainingAfterCommitted: number | null;
	/** Employee Pay first, then active Spending Categories and Retired ones that had a target in the month. */
	categories: CategorySpend[];
	/** The part of the Appropriation no target covers. */
	unassigned: { percent: number; amount: number | null };
}

export interface CategorySpend {
	id: number;
	name: string;
	/** Hundredths of a percent of the Appropriation. */
	targetPercent: number | null;
	/** The target in dollars, when the month has an Appropriation. */
	target: number | null;
	spent: number;
	/** Only for the current month. */
	committed: number | null;
	overTarget: boolean;
}

export interface JobSpend {
	job: string;
	amount: number;
}

export function setAppropriation(payMe: PayMe, actor: Actor, amountText: string, fromMonthText: string): Outcome {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const amount = parseRate(amountText);
	if (amount === null) return fail({ code: 'invalid-amount', amount: amountText });
	const fromMonth = parseMonth(fromMonthText);
	if (!fromMonth) return fail({ code: 'invalid-month', month: fromMonthText });

	insertAppropriation(payMe.storage, fromMonth, amount, actor.userId);
	return succeed([{ type: 'private-reply', card: notice(`The Appropriation is ${formatAmount(amount)} a month from ${monthName(fromMonth)}.`) }]);
}

export function showAppropriation(payMe: PayMe, actor: Actor, monthText: string | null, now = new Date()): Outcome<AppropriationView> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const month = monthText === null ? monthOf(now) : parseMonth(monthText);
	if (!month) return fail({ code: 'invalid-month', month: monthText! });

	const view = viewOf(payMe, month, now);
	return succeed([{ type: 'show-appropriation', card: appropriationCard(view), month }], view);
}

function viewOf(payMe: PayMe, month: string, now: Date): AppropriationView {
	const appropriation = selectAppropriationFor(payMe.storage, month);
	const spentByJob = spendByJob(payMe, month);
	const spent = spentByJob.reduce((sum, job) => sum + job.amount, 0);
	const isCurrentMonth = month === monthOf(now);
	const owed = isCurrentMonth ? committedToday(payMe) : null;
	const committed = owed?.committed ?? null;
	const remaining = isCurrentMonth && appropriation !== null ? appropriation - spent : null;
	const targets = spendingCategoryTargets(payMe, month);
	const targetOf = (percent: number | null) => (percent === null || appropriation === null ? null : Math.round((appropriation * percent) / 10000));
	const categories = allSpendingCategories(payMe)
		.filter((category) => !category.retired || targets.has(category.id))
		.map((category): CategorySpend => {
			const isEmployeePay = category.id === employeePayId;
			const targetPercent = targets.get(category.id) ?? null;
			const target = targetOf(targetPercent);
			const categorySpent = isEmployeePay ? spent : 0;
			return {
				id: category.id,
				name: category.name,
				targetPercent,
				target,
				spent: categorySpent,
				committed: committed === null ? null : isEmployeePay ? committed : 0,
				overTarget: target !== null && categorySpent > target
			};
		});
	const unassignedPercent = 10000 - [...targets.values()].reduce((sum, percent) => sum + percent, 0);
	return {
		month,
		appropriation,
		spent,
		spentByJob,
		committed,
		committedEstimate: owed?.estimated ?? null,
		reserved: isCurrentMonth ? reservedToday(payMe) : null,
		remaining,
		remainingAfterCommitted: remaining === null || committed === null ? null : remaining - committed,
		categories,
		unassigned: { percent: unassignedPercent, amount: targetOf(unassignedPercent) }
	};
}

/** A warning when marking a Payout paid has taken this month's Spent over its Appropriation (ADR 0003). */
export function overSpentWarning(payMe: PayMe): Effect[] {
	const view = currentView(payMe);
	return warnIfOver(view, view.spent, (amounts) => `${monthName(view.month)} has spent ${amounts}.`);
}

/** A warning when Spent, Committed and Reserved together now exceed this month's Appropriation (ADR 0003). */
export function overCommittedWarning(payMe: PayMe): Effect[] {
	const view = currentView(payMe);
	const total = view.spent + (view.committed ?? 0) + (view.reserved ?? 0);
	return warnIfOver(view, total, (amounts) => `${monthName(view.month)}'s Spent, Committed and Reserved now come to ${amounts}.`);
}

/** A warning when this month's Spent in the Category has gone over its target (ADR 0003). */
export function overTargetWarning(payMe: PayMe, categoryId: number): Effect[] {
	const view = currentView(payMe);
	const category = view.categories.find((each) => each.id === categoryId);
	if (!category?.overTarget) return [];
	const over = formatAmount(category.spent - category.target!);
	const text = `${category.name} has spent ${formatAmount(category.spent)} of its ${formatAmount(category.target!)} target for ${monthName(view.month)}, ${over} over.`;
	return [{ type: 'private-reply', card: notice(`**Over target**: ${text}`, 'warning') }];
}

function currentView(payMe: PayMe): AppropriationView {
	const now = new Date();
	return viewOf(payMe, monthOf(now), now);
}

function warnIfOver(view: AppropriationView, total: number, sentence: (amounts: string) => string): Effect[] {
	if (view.appropriation === null || total <= view.appropriation) return [];
	const amounts = `${formatAmount(total)} of its ${formatAmount(view.appropriation)}, ${formatAmount(total - view.appropriation)} over`;
	return [warning(sentence(amounts))];
}

function warning(text: string): Effect {
	return { type: 'private-reply', card: notice(`**Over the Appropriation**: ${text}`, 'warning') };
}

function appropriationCard(view: AppropriationView): Card {
	const row = (label: string, amount: number | null, suffix = '') => (amount === null ? [] : [`**${label}**: ${formatAmount(amount)}${suffix}`]);
	const estimate = view.committedEstimate ? `, including ${formatAmount(view.committedEstimate)} estimated at current Rates` : '';
	const jobs = view.spentByJob.map((job) => `- ${job.job}: ${formatAmount(job.amount)}`);
	const description = [
		view.appropriation === null ? '**Appropriation**: Not set' : `**Appropriation**: ${formatAmount(view.appropriation)}`,
		...row('Spent', view.spent),
		...row('Committed', view.committed, estimate),
		...row('Reserved', view.reserved, ' in Open Projects'),
		...row('Remaining', view.remaining),
		...row('Remaining after commitments', view.remainingAfterCommitted),
		'',
		'**Spending Categories**',
		...view.categories.map(categoryLine),
		`- Unassigned: ${targetText(view.unassigned.percent, view.unassigned.amount)}`,
		'',
		'**Spent by Job**',
		...(jobs.length ? jobs : ['Nothing was paid.'])
	].join('\n');
	return { tone: 'info', title: `Appropriation · ${monthName(view.month)}`, description, footer: 'Months are calendar months in UTC.' };
}

function categoryLine(category: CategorySpend): string {
	const parts = [
		category.targetPercent === null ? 'no target' : `target ${targetText(category.targetPercent, category.target)}`,
		`Spent ${formatAmount(category.spent)}`,
		...(category.committed === null ? [] : [`Committed ${formatAmount(category.committed)}`]),
		...(category.overTarget ? ['**over target**'] : [])
	];
	return `- ${category.name}: ${parts.join(' · ')}`;
}

function targetText(percent: number, amount: number | null): string {
	return amount === null ? formatPercent(percent) : `${formatPercent(percent)} (${formatAmount(amount)})`;
}

const employeePay = 'Employee Pay';
const maxReportMonths = 120;

export interface AppropriationReport {
	summary: string;
	items: string;
}

/** Spend for every month from `fromText` to `toText`, as CSV for the authority that grants the Appropriation. */
export function appropriationReport(payMe: PayMe, actor: Actor, fromText: string, toText: string): Outcome<AppropriationReport> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const from = parseMonth(fromText);
	if (!from) return fail({ code: 'invalid-month', month: fromText });
	const to = parseMonth(toText);
	if (!to) return fail({ code: 'invalid-month', month: toText });
	if (to < from) return fail({ code: 'invalid-month-range', from, to });
	const length = monthIndex(to) - monthIndex(from) + 1;
	if (length > maxReportMonths) return fail({ code: 'report-too-long', months: length, max: maxReportMonths });

	const months = monthsBetween(from, to);
	const summary = csv(
		['month', 'spending_category', 'job', 'appropriation', 'target', 'spent', 'over_under'],
		months.flatMap((month) => summaryRows(payMe, month))
	);
	const items = csv(
		['date_paid', 'month', 'spending_category', 'job', 'task_or_project', 'recipient', 'amount', 'paid_by', 'reference', 'payout'],
		paidIn(payMe, months).flatMap((payout) => itemRows(payMe, payout))
	);
	const card = notice(`Spend from ${monthName(from)} to ${monthName(to)}.`, 'info');
	const files = [
		{ name: 'summary.csv', content: summary },
		{ name: 'items.csv', content: items }
	];
	return succeed([{ type: 'private-files', card, files }], { summary, items });
}

/** Payouts marked paid in any of `months`, in the order they were paid. */
function paidIn(payMe: PayMe, months: readonly string[]): Payout[] {
	return paidPayouts(payMe)
		.filter((payout) => months.includes(monthOf(payout.settledAt!)))
		.sort((a, b) => a.settledAt!.localeCompare(b.settledAt!) || a.number - b.number);
}

function itemRows(payMe: PayMe, payout: Payout): string[][] {
	const settledAt = payout.settledAt!;
	const row = (jobId: number, item: string, amount: number, reference: string) => [
		settledAt.slice(0, 10),
		monthOf(settledAt),
		employeePay,
		getJob(payMe, jobId)!.name,
		item,
		payout.minecraftName,
		plainAmount(amount),
		getEmployee(payMe, payout.settledBy!)?.minecraftName ?? payout.settledBy!,
		reference,
		payoutLabel(payout.number)
	];
	return [
		...payout.lines.map((line) => row(line.jobId, getTask(payMe, line.taskId)!.name, line.rate, requestLabel(line.requestNumber))),
		...payout.shares.map((line) => row(line.jobId, getProject(payMe, line.projectId)!.name, line.amount, shareLabel(line.shareId)))
	];
}

function summaryRows(payMe: PayMe, month: string): string[][] {
	const view = viewOf(payMe, month, new Date());
	const amount = (hundredths: number | null) => (hundredths === null ? '' : plainAmount(hundredths));
	const overUnder = (limit: number | null, spent: number) => (limit === null ? '' : signedAmount(spent - limit));
	return [
		[month, '', '', amount(view.appropriation), '', plainAmount(view.spent), overUnder(view.appropriation, view.spent)],
		...view.categories.flatMap((category) => [
			[month, category.name, '', '', amount(category.target), plainAmount(category.spent), overUnder(category.target, category.spent)],
			...(category.id === employeePayId
				? view.spentByJob.map((job) => [month, category.name, job.job, '', '', plainAmount(job.amount), ''])
				: [])
		])
	];
}

function monthsBetween(from: string, to: string): string[] {
	const start = monthIndex(from);
	return Array.from({ length: monthIndex(to) - start + 1 }, (_, offset) => monthAt(start + offset));
}

/** Months since year 0, so months can be counted and stepped through. */
function monthIndex(month: string): number {
	const [year, monthNumber] = month.split('-').map(Number);
	return year * 12 + monthNumber - 1;
}

function monthAt(index: number): string {
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

function signedAmount(hundredths: number): string {
	return hundredths < 0 ? `-${plainAmount(-hundredths)}` : plainAmount(hundredths);
}

function csv(header: readonly string[], rows: readonly (readonly string[])[]): string {
	return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n') + '\n';
}

/** Quotes what needs it, and stops a spreadsheet reading text such as `=SUM(...)` as a formula. */
function csvField(value: string): string {
	const safe = /^[=+\-@\t\r]/.test(value) && !/^-\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
	return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function committedToday(payMe: PayMe): { committed: number; estimated: number } {
	const owed = owedSummary(payMe);
	return { committed: owed.total + owed.openPayouts.reduce((sum, payout) => sum + payout.total, 0), estimated: owed.estimated };
}

function reservedToday(payMe: PayMe): number {
	return allProjects(payMe)
		.filter((project) => project.state === 'open')
		.reduce((sum, project) => sum + balanceOf(project), 0);
}

function spendByJob(payMe: PayMe, month: string): JobSpend[] {
	const byJob = new Map<number, number>();
	const add = (jobId: number, amount: number) => byJob.set(jobId, (byJob.get(jobId) ?? 0) + amount);
	for (const payout of paidPayouts(payMe).filter((paid) => monthOf(paid.settledAt!) === month)) {
		for (const line of payout.lines) add(line.jobId, line.rate);
		for (const line of payout.shares) add(line.jobId, line.amount);
	}
	return [...byJob].map(([jobId, amount]) => ({ job: getJob(payMe, jobId)!.name, amount })).sort((a, b) => a.job.localeCompare(b.job));
}

/** A month as YYYY-MM, from 2000-01 to 2999-12, or null. */
export function parseMonth(text: string): string | null {
	const match = /^(2\d{3})-(0[1-9]|1[0-2])$/.exec(text.trim());
	return match ? match[0] : null;
}

/** The UTC calendar month a time falls in, as YYYY-MM. */
export function monthOf(time: Date | string): string {
	return (typeof time === 'string' ? time : time.toISOString()).slice(0, 7);
}

export function monthName(month: string): string {
	const [year, monthNumber] = month.split('-').map(Number);
	return new Date(Date.UTC(year, monthNumber - 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Next month and the twelve before it, newest first, for picking a month. */
export function recentMonths(now: Date): string[] {
	return Array.from({ length: 13 }, (_, index) => monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1 - index))));
}
