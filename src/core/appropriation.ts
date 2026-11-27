import { insertAppropriation, selectAppropriationFor } from '../storage/appropriations';
import type { Actor } from './actor';
import { notice, type Card, type Effect } from './effects';
import { fail, succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { requireLeadership } from './permissions';
import { getEmployee } from './employees';
import { getJob } from './jobs';
import { disbursementLabel, disbursementStateName, payoutLabel, requestLabel, shareLabel } from './labels';
import { paidDisbursements, requestedDisbursements, voidedDisbursements, type Disbursement } from './disbursements';
import { owedSummary, paidPayouts, type Payout } from './payouts';
import { allProjects, balanceOf, getProject } from './projects';
import { getTask } from './tasks';
import { monthName, monthOf, parseMonth } from './months';
import { formatAmount, formatPercent, parseRate, plainAmount, wholePercent } from './rates';
import {
	allSpendingCategories,
	employeePayId,
	getSpendingCategory,
	spendingCategoryTargets,
	targetDollars,
	totalTargets,
	type SpendingCategory,
	type Target
} from './spending-categories';

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
	/** The part of the Appropriation no target covers. `percent` is null when amount targets leave it unknown without an Appropriation. */
	unassigned: { percent: number | null; amount: number | null };
}

export interface CategorySpend {
	id: number;
	name: string;
	/** Hundredths of a percent of the Appropriation, when the target is a percentage. */
	targetPercent: number | null;
	/** The target in dollars: an amount target, or a percentage of the month's Appropriation when it has one. */
	target: number | null;
	spent: number;
	/** Only for the current month. */
	committed: number | null;
	/** Open Projects' money not yet given as Shares, under Employee Pay. Only for the current month. */
	reserved: number | null;
	overTarget: boolean;
}

interface CategoryFigures {
	spent: number;
	committed: number | null;
	reserved: number | null;
}

function categorySpendOf(category: SpendingCategory, set: Target | null, appropriation: number | null, figures: CategoryFigures): CategorySpend {
	const target = targetDollars(set, appropriation);
	return {
		id: category.id,
		name: category.name,
		targetPercent: set?.kind === 'percent' ? set.value : null,
		target,
		...figures,
		overTarget: target !== null && figures.spent > target
	};
}

/** The current month lists every active Category; earlier and later ones only those that had a target or Spend. */
function shownIn(category: SpendingCategory, row: CategorySpend, isCurrentMonth: boolean): boolean {
	if (category.builtIn || row.targetPercent !== null || row.target !== null || row.spent > 0 || (row.committed ?? 0) > 0) return true;
	return isCurrentMonth && !category.retired;
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
	const payoutsSpent = spentByJob.reduce((sum, job) => sum + job.amount, 0);
	const isCurrentMonth = month === monthOf(now);
	const owed = isCurrentMonth ? committedToday(payMe) : null;
	const reserved = isCurrentMonth ? reservedToday(payMe) : null;
	const disbursed = totalsByCategory(paidDisbursementsIn(payMe, [month]));
	const requested = totalsByCategory(isCurrentMonth ? requestedDisbursements(payMe) : []);
	const figuresFor = (category: SpendingCategory): CategoryFigures => {
		if (category.builtIn) return { spent: payoutsSpent, committed: owed?.committed ?? null, reserved };
		const committed = isCurrentMonth ? (requested.get(category.id) ?? 0) : null;
		return { spent: disbursed.get(category.id) ?? 0, committed, reserved: null };
	};

	const targets = spendingCategoryTargets(payMe, month);
	const categories = allSpendingCategories(payMe).flatMap((category) => {
		const row = categorySpendOf(category, targets.get(category.id) ?? null, appropriation, figuresFor(category));
		return shownIn(category, row, isCurrentMonth) ? [row] : [];
	});
	const spent = payoutsSpent + sumOf(disbursed);
	const committed = owed === null ? null : owed.committed + sumOf(requested);
	const remaining = isCurrentMonth && appropriation !== null ? appropriation - spent : null;
	const assigned = categories.reduce((sum, row) => sum + (row.target ?? 0), 0);
	return {
		month,
		appropriation,
		spent,
		spentByJob,
		committed,
		committedEstimate: owed?.estimated ?? null,
		reserved,
		remaining,
		remainingAfterCommitted: remaining === null || committed === null ? null : remaining - committed,
		categories,
		unassigned: unassignedOf(targets, appropriation, assigned)
	};
}

function unassignedOf(targets: ReadonlyMap<number, Target>, appropriation: number | null, assigned: number): AppropriationView['unassigned'] {
	const total = totalTargets(targets.values());
	if (appropriation === null) return { percent: total.amount === 0 ? wholePercent - total.percent : null, amount: null };
	const amount = appropriation - assigned;
	if (total.amount === 0) return { percent: wholePercent - total.percent, amount };
	return { percent: appropriation === 0 ? null : Math.round((amount * wholePercent) / appropriation), amount };
}

function totalsByCategory(disbursements: readonly Disbursement[]): Map<number, number> {
	const totals = new Map<number, number>();
	for (const each of disbursements) totals.set(each.categoryId, (totals.get(each.categoryId) ?? 0) + each.amount);
	return totals;
}

function sumOf(totals: ReadonlyMap<number, number>): number {
	return [...totals.values()].reduce((sum, amount) => sum + amount, 0);
}

function paidDisbursementsIn(payMe: PayMe, months: readonly string[]): Disbursement[] {
	return settledIn(paidDisbursements(payMe), months);
}

/** Those paid (and, if since Voided, paid first) in any of `months`. */
function settledIn(disbursements: readonly Disbursement[], months: readonly string[]): Disbursement[] {
	return disbursements.filter((each) => months.includes(monthOf(each.settledAt!)));
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
	if (!category) return [];
	return warnIfOverTarget(view, category, category.spent, `${category.name} has spent`);
}

/** A warning when the Category's Spent, Committed and Reserved together now exceed its target this month (ADR 0003). */
export function overCommittedTargetWarning(payMe: PayMe, categoryId: number): Effect[] {
	const view = currentView(payMe);
	const category = view.categories.find((each) => each.id === categoryId);
	if (!category) return [];
	const total = category.spent + (category.committed ?? 0) + (category.reserved ?? 0);
	return warnIfOverTarget(view, category, total, `${category.name}'s Spent, Committed and Reserved now come to`);
}

function warnIfOverTarget(view: AppropriationView, category: CategorySpend, total: number, opening: string): Effect[] {
	if (category.target === null || total <= category.target) return [];
	const text = `${opening} ${formatAmount(total)} of its ${formatAmount(category.target)} target for ${monthName(view.month)}, ${formatAmount(total - category.target)} over.`;
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
		`- Unassigned: ${unassignedText(view.unassigned)}`,
		'',
		'**Spent by Job**',
		...(jobs.length ? jobs : ['Nothing was paid.'])
	].join('\n');
	return { tone: 'info', title: `Appropriation · ${monthName(view.month)}`, description, footer: 'Months are calendar months in UTC.' };
}

function categoryLine(category: CategorySpend): string {
	const parts = [
		category.targetPercent === null && category.target === null ? 'no target' : `target ${targetText(category.targetPercent, category.target)}`,
		`Spent ${formatAmount(category.spent)}`,
		...(category.committed === null ? [] : [`Committed ${formatAmount(category.committed)}`]),
		...(category.reserved ? [`Reserved ${formatAmount(category.reserved)}`] : []),
		...(category.overTarget ? ['**over target**'] : [])
	];
	return `- ${category.name}: ${parts.join(' · ')}`;
}

function targetText(percent: number | null, amount: number | null): string {
	if (percent === null) return amount === null ? 'unknown until the Appropriation is set' : formatAmount(amount);
	return amount === null ? formatPercent(percent) : `${formatPercent(percent)} (${formatAmount(amount)})`;
}

function unassignedText({ percent, amount }: AppropriationView['unassigned']): string {
	if (amount !== null && amount < 0) return `none, the targets are ${formatAmount(-amount)} over the Appropriation`;
	return targetText(percent, amount);
}

const employeePay = 'Employee Pay';
const maxReportMonths = 120;

export interface AppropriationReport {
	summary: string;
	items: string;
}

/** Spend for every month from `fromText` to `toText`, as CSV for the authority that grants the Appropriation. */
export function appropriationReport(payMe: PayMe, actor: Actor, fromText: string, toText: string, now = new Date()): Outcome<AppropriationReport> {
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
		months.flatMap((month) => summaryRows(payMe, month, now))
	);
	const items = csv(
		[
			'date_paid',
			'month',
			'spending_category',
			'job',
			'task_or_project',
			'recipient',
			'amount',
			'requested_by',
			'paid_by',
			'reference',
			'payout',
			'state'
		],
		paidItems(payMe, months)
	);
	const card = notice(`Spend from ${monthName(from)} to ${monthName(to)}.`, 'info');
	const files = [
		{ name: 'summary.csv', content: summary },
		{ name: 'items.csv', content: items }
	];
	return succeed([{ type: 'private-files', card, files }], { summary, items });
}

/** Every paid Payout line, Share and Disbursement in `months`, in the order they were paid. */
function paidItems(payMe: PayMe, months: readonly string[]): string[][] {
	const payouts = paidPayouts(payMe)
		.filter((payout) => months.includes(monthOf(payout.settledAt!)))
		.sort((a, b) => a.number - b.number)
		.flatMap((payout) => payoutItemRows(payMe, payout));
	const disbursements = settledIn([...paidDisbursements(payMe), ...voidedDisbursements(payMe)], months).map((each) =>
		disbursementItemRow(payMe, each)
	);
	return [...payouts, ...disbursements].sort((a, b) => a.at.localeCompare(b.at)).map((item) => item.row);
}

interface ItemRow {
	/** When it was paid, to sort by. */
	at: string;
	row: string[];
}

function payoutItemRows(payMe: PayMe, payout: Payout): ItemRow[] {
	const at = payout.settledAt!;
	const row = (jobId: number, item: string, amount: number, reference: string): ItemRow => ({
		at,
		row: [
			at.slice(0, 10),
			monthOf(at),
			employeePay,
			getJob(payMe, jobId)!.name,
			item,
			payout.minecraftName,
			plainAmount(amount),
			'',
			personName(payMe, payout.settledBy!),
			reference,
			payoutLabel(payout.number),
			'Paid'
		]
	});
	return [
		...payout.lines.map((line) => row(line.jobId, getTask(payMe, line.taskId)!.name, line.rate, requestLabel(line.requestNumber))),
		...payout.shares.map((line) => row(line.jobId, getProject(payMe, line.projectId)!.name, line.amount, shareLabel(line.shareId)))
	];
}

function disbursementItemRow(payMe: PayMe, disbursement: Disbursement): ItemRow {
	const at = disbursement.settledAt!;
	return {
		at,
		row: [
			at.slice(0, 10),
			monthOf(at),
			getSpendingCategory(payMe, disbursement.categoryId)!.name,
			disbursement.jobId === null ? '' : getJob(payMe, disbursement.jobId)!.name,
			'',
			disbursement.recipient,
			plainAmount(disbursement.amount),
			personName(payMe, disbursement.requestedBy),
			personName(payMe, disbursement.settledBy!),
			disbursementLabel(disbursement.number),
			'',
			disbursementStateName(disbursement.state)
		]
	};
}

/** A Minecraft Name when they are an Employee, otherwise their Discord ID. */
function personName(payMe: PayMe, userId: string): string {
	return getEmployee(payMe, userId)?.minecraftName ?? userId;
}

function summaryRows(payMe: PayMe, month: string, now: Date): string[][] {
	const view = viewOf(payMe, month, now);
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
