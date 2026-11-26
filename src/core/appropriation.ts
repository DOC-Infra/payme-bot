import { insertAppropriation, selectAppropriationFor } from '../storage/appropriations';
import type { Actor } from './actor';
import { notice, type Card } from './effects';
import { fail, succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { requireLeadership } from './permissions';
import { getJob } from './jobs';
import { owedSummary, paidPayouts } from './payouts';
import { allProjects, balanceOf } from './projects';
import { formatAmount, parseRate } from './rates';

export interface AppropriationView {
	/** YYYY-MM, a calendar month in UTC. */
	month: string;
	appropriation: number | null;
	/** Payouts marked paid in the month (ADR 0002). */
	spent: number;
	spentByJob: JobSpend[];
	/** What paying everything owed today would cost; Approved requests are estimated at current Rates (ADR 0001). Only for the current month. */
	committed: number | null;
	/** Open Projects' money not yet given as Shares. Only for the current month. */
	reserved: number | null;
	remaining: number | null;
	remainingAfterCommitted: number | null;
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

/** `month` defaults to the month `now` is in. */
export function showAppropriation(payMe: PayMe, actor: Actor, monthText: string | null, now = new Date()): Outcome<AppropriationView> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const month = monthText === null ? monthOf(now) : parseMonth(monthText);
	if (!month) return fail({ code: 'invalid-month', month: monthText! });

	const appropriation = selectAppropriationFor(payMe.storage, month);
	const spentByJob = spendByJob(payMe, month);
	const spent = spentByJob.reduce((sum, job) => sum + job.amount, 0);
	const current = month === monthOf(now);
	const committed = current ? committedToday(payMe) : null;
	const remaining = appropriation === null ? null : appropriation - spent;
	const view: AppropriationView = {
		month,
		appropriation,
		spent,
		spentByJob,
		committed,
		reserved: current ? reservedToday(payMe) : null,
		remaining,
		remainingAfterCommitted: remaining === null || committed === null ? null : remaining - committed
	};
	return succeed([{ type: 'private-reply', card: appropriationCard(view) }], view);
}

function appropriationCard(view: AppropriationView): Card {
	const line = (label: string, amount: number | null, suffix = '') => (amount === null ? [] : [`**${label}**: ${formatAmount(amount)}${suffix}`]);
	const jobs = view.spentByJob.map((job) => `- ${job.job}: ${formatAmount(job.amount)}`);
	const description = [
		view.appropriation === null ? '**Appropriation**: Not set' : `**Appropriation**: ${formatAmount(view.appropriation)}`,
		...line('Spent', view.spent),
		...line('Committed', view.committed, ', estimated at current Rates'),
		...line('Reserved', view.reserved, ' in Open Projects'),
		...line('Remaining', view.remaining),
		...line('Remaining after commitments', view.remainingAfterCommitted),
		'',
		'**Spent by Job**',
		...(jobs.length ? jobs : ['Nothing was paid.'])
	].join('\n');
	return { tone: 'info', title: `Appropriation · ${monthName(view.month)}`, description, footer: 'Months are calendar months in UTC.' };
}

function committedToday(payMe: PayMe): number {
	const owed = owedSummary(payMe);
	return owed.total + owed.openPayouts.reduce((sum, payout) => sum + payout.total, 0);
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

function parseMonth(text: string): string | null {
	const match = /^(\d{4})-(\d{2})$/.exec(text.trim());
	if (!match) return null;
	const month = Number(match[2]);
	return month >= 1 && month <= 12 ? match[0] : null;
}

/** The UTC calendar month a time falls in, as YYYY-MM. */
export function monthOf(time: Date | string): string {
	return (typeof time === 'string' ? time : time.toISOString()).slice(0, 7);
}

export function monthName(month: string): string {
	const [year, number] = month.split('-').map(Number);
	return new Date(Date.UTC(year, number - 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
