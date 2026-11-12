import { insertPayout, selectOpenPayout, selectPayout, selectPayoutsInState, settlePayout } from '../storage/payouts';
import type { Actor } from './actor';
import type { Card, Effect, PayoutAction } from './effects';
import { getEmployee } from './employees';
import { jobsHeldBy, jobsManagedBy } from './job-membership';
import { changeState } from './lifecycle';
import { getJob, type Job } from './jobs';
import { payoutLabel, payoutStateName, payoutTone, requestLabel, type PayoutState } from './labels';
import { fail, succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { isLeadership, requireLeadership } from './permissions';
import { formatAmount } from './rates';
import { updateReviewCopies, type PaymentRequest } from './requests';
import { getTask } from './tasks';

export interface PayoutLine {
	requestNumber: number;
	taskId: number;
	jobId: number;
	rate: number;
}

export interface Payout {
	number: number;
	employeeUserId: string;
	minecraftName: string;
	total: number;
	state: PayoutState;
	lines: PayoutLine[];
	generatedBy: string;
	generatedAt: string;
	settledBy: string | null;
	settledAt: string | null;
}

export interface Owed {
	unpaidRequestNumbers: number[];
	estimatedTotal: number;
	openPayout: Payout | null;
}

export interface EmployeeOwed extends Owed {
	employeeUserId: string;
	minecraftName: string;
}

export interface PayoutsView {
	owed: EmployeeOwed[];
	history: Payout[];
}

export function getPayout(payMe: PayMe, number: number): Payout | null {
	return selectPayout(payMe.storage, number);
}

/** What is owed, read in one go. */
interface Owing {
	approved: PaymentRequest[];
	unpaid: PaymentRequest[];
	openPayouts: Payout[];
	rates: ReadonlyMap<number, number>;
}

function loadOwing(payMe: PayMe, employeeUserId?: string): Owing {
	const approved = payMe.requests.loadMany({ employeeUserId, states: ['approved'] });
	const openPayouts = loadOpenPayouts(payMe, employeeUserId);
	const unpaid = unpaidRequests(approved, openPayouts);
	return { approved, unpaid, openPayouts, rates: currentRates(payMe, unpaid) };
}

function loadOpenPayouts(payMe: PayMe, employeeUserId?: string): Payout[] {
	if (employeeUserId === undefined) return selectPayoutsInState(payMe.storage, 'open');
	const open = selectOpenPayout(payMe.storage, employeeUserId);
	return open ? [open] : [];
}

/** A request is unpaid when it is Approved and not locked in an Open Payout. */
function unpaidRequests(requests: readonly PaymentRequest[], openPayouts: readonly Payout[]): PaymentRequest[] {
	const locked = new Set(openPayouts.flatMap((payout) => payout.lines.map((line) => line.requestNumber)));
	return requests.filter((request) => request.state === 'approved' && !locked.has(request.number));
}

/** A Payout line belongs to the lowest-numbered Job the request is eligible under. */
function lineJobId(request: PaymentRequest): number {
	return Math.min(...request.eligibleJobIds);
}

function currentRates(payMe: PayMe, requests: readonly PaymentRequest[]): Map<number, number> {
	const taskIds = new Set(requests.map((request) => request.taskId));
	return new Map([...taskIds].map((taskId) => [taskId, getTask(payMe, taskId)!.rate]));
}

function rateOf(owing: Owing, request: PaymentRequest): number {
	return owing.rates.get(request.taskId)!;
}

function sumOfRates(lines: readonly { rate: number }[]): number {
	return lines.reduce((sum, line) => sum + line.rate, 0);
}

// Unpaid requests are estimated at current Rates; an Open Payout keeps its frozen total (ADR 0001).
function owedBy(owing: Owing, employeeUserId: string): Owed {
	const unpaid = owing.unpaid.filter((request) => request.employeeUserId === employeeUserId);
	return {
		unpaidRequestNumbers: unpaid.map((request) => request.number),
		estimatedTotal: unpaid.reduce((sum, request) => sum + rateOf(owing, request), 0),
		openPayout: owing.openPayouts.find((payout) => payout.employeeUserId === employeeUserId) ?? null
	};
}

export function owedTo(payMe: PayMe, employeeUserId: string): Owed {
	return owedBy(loadOwing(payMe, employeeUserId), employeeUserId);
}

export function totalOwed(owed: Owed): number {
	return owed.estimatedTotal + (owed.openPayout?.total ?? 0);
}

function owedAndHistory(payMe: PayMe, owing: Owing, employeeUserIds?: readonly string[]): PayoutsView {
	const inScope = (userId: string) => !employeeUserIds || employeeUserIds.includes(userId);
	const owingUserIds = [...owing.unpaid, ...owing.openPayouts].map((item) => item.employeeUserId);
	const owed = [...new Set(owingUserIds)].filter(inScope).map((userId) => ({
		employeeUserId: userId,
		minecraftName: getEmployee(payMe, userId)!.minecraftName,
		...owedBy(owing, userId)
	}));
	owed.sort((a, b) => a.minecraftName.localeCompare(b.minecraftName));
	const history = selectPayoutsInState(payMe.storage, 'paid', 'discarded').filter((payout) => inScope(payout.employeeUserId));
	return { owed, history };
}

export function showPayouts(payMe: PayMe, actor: Actor, members: readonly Actor[]): Outcome<PayoutsView> {
	if (isLeadership(payMe, actor)) return leadershipView(payMe);

	const managed = jobsManagedBy(payMe, actor);
	if (managed.length === 0) return fail({ code: 'not-permitted' });

	const owing = loadOwing(payMe);
	const holders = members.filter((member) => holdsAnyJob(payMe, member, managed)).map((member) => member.userId);
	const view = owedAndHistory(payMe, owing, [...holders, ...owedForJobs(owing, managed)]);
	const history = view.history.map(historyText);
	const description = [...owedLines(view), '', '**Payout history**', ...(history.length ? history : ['No Payouts yet.'])].join('\n');
	return succeed([{ type: 'show-payouts', card: { tone: 'info', title: 'Payouts (read-only)', description }, actions: [] }], view);
}

function holdsAnyJob(payMe: PayMe, member: Actor, jobs: readonly Job[]): boolean {
	return jobsHeldBy(payMe, member).some((held) => jobs.some((job) => job.id === held.id));
}

// Every Approved request is either unpaid or locked in an Open Payout, so all of them are owed.
function owedForJobs(owing: Owing, jobs: readonly Job[]): string[] {
	return owing.approved.filter((request) => jobs.some((job) => request.eligibleJobIds.includes(job.id))).map((request) => request.employeeUserId);
}

function leadershipView(payMe: PayMe): Outcome<PayoutsView> {
	const view = owedAndHistory(payMe, loadOwing(payMe));
	const actions = view.owed.map((employee): PayoutAction =>
		employee.openPayout
			? {
					kind: 'show',
					payoutNumber: employee.openPayout.number,
					label: `${payoutLabel(employee.openPayout.number)} for ${employee.minecraftName}`
				}
			: { kind: 'generate', employeeUserId: employee.employeeUserId, label: `Generate for ${employee.minecraftName}` }
	);
	return succeed([{ type: 'show-payouts', card: { tone: 'info', title: 'Payouts', description: owedLines(view).join('\n') }, actions }], view);
}

function owedLines(view: PayoutsView): string[] {
	if (view.owed.length === 0) return ['Nobody is owed anything.'];
	return view.owed.map((employee) => `<@${employee.employeeUserId}> (${employee.minecraftName}): ${owedText(employee)}`);
}

function historyText(payout: Payout): string {
	const date = (payout.settledAt ?? payout.generatedAt).slice(0, 10);
	const { number, employeeUserId, minecraftName, total, state } = payout;
	return `**${payoutLabel(number)}** for <@${employeeUserId}> (${minecraftName}): ${formatAmount(total)}, ${payoutStateName(state)} on ${date}`;
}

export function showPayout(payMe: PayMe, actor: Actor, number: number): Outcome<Payout> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const payout = getPayout(payMe, number);
	if (!payout) return fail({ code: 'payout-not-found' });
	return succeed([payoutEffect(payMe, payout)], payout);
}

function owedText(employee: EmployeeOwed): string {
	const parts: string[] = [];
	if (employee.openPayout) parts.push(`Open Payout **${payoutLabel(employee.openPayout.number)}**, ${formatAmount(employee.openPayout.total)}`);
	if (employee.unpaidRequestNumbers.length) {
		const requests = employee.unpaidRequestNumbers.map(requestLabel).join(', ');
		parts.push(`about ${formatAmount(employee.estimatedTotal)} owed (estimate at current Rates) for ${requests}`);
	}
	return parts.join('; ');
}

export function generatePayout(payMe: PayMe, actor: Actor, employeeUserId: string): Outcome<Payout> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		const employee = getEmployee(payMe, employeeUserId);
		if (!employee) return fail({ code: 'employee-not-found' });
		const owing = loadOwing(payMe, employeeUserId);
		const [open] = owing.openPayouts;
		if (open) return fail({ code: 'payout-already-open', number: open.number });

		const lines = owing.unpaid.map((request): PayoutLine => ({
			requestNumber: request.number,
			taskId: request.taskId,
			jobId: lineJobId(request),
			rate: rateOf(owing, request)
		}));
		if (lines.length === 0) return fail({ code: 'nothing-owed' });
		const { minecraftName } = employee;
		const number = insertPayout(storage, { employeeUserId, minecraftName, generatedBy: actor.userId, total: sumOfRates(lines), lines });
		const payout = getPayout(payMe, number)!;
		return succeed([payoutEffect(payMe, payout)], payout);
	});
}

export function markPayoutPaid(payMe: PayMe, actor: Actor, number: number): Outcome<Payout> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		if (!settlePayout(storage, number, 'paid', actor.userId)) return notOpen(payMe, number);

		const payout = getPayout(payMe, number)!;
		const effects: Effect[] = payout.lines.map((line) => {
			const paid = changeState(payMe, actor, line.requestNumber, 'pay');
			// Nothing changes a request while it is in an Open Payout, so a refusal is a bug. Throwing rolls the Payout back too.
			if (!paid.ok) throw new Error(`Cannot pay ${requestLabel(line.requestNumber)} in ${payoutLabel(number)}: ${paid.error.code}`);
			return updateReviewCopies(payMe, paid.value);
		});
		const log: Card = {
			tone: 'success',
			title: `${payoutLabel(number)} paid`,
			description: [
				`Paid by <@${actor.userId}>: **${formatAmount(payout.total)}** to ${payout.minecraftName}`,
				...payout.lines.map((line) => `- ${lineText(payMe, line)}`)
			].join('\n')
		};
		effects.push({ type: 'post-to-requests-thread', employeeUserId: payout.employeeUserId, card: log, ping: false }, payoutEffect(payMe, payout));
		return succeed(effects, payout);
	});
}

export function discardPayout(payMe: PayMe, actor: Actor, number: number): Outcome<Payout> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		if (!settlePayout(storage, number, 'discarded', actor.userId)) return notOpen(payMe, number);

		const payout = getPayout(payMe, number)!;
		return succeed([payoutEffect(payMe, payout)], payout);
	});
}

function notOpen(payMe: PayMe, number: number) {
	const payout = getPayout(payMe, number);
	if (!payout) return fail({ code: 'payout-not-found' });
	return fail({ code: 'payout-not-open', number, state: payout.state });
}

export function payCommand(payout: Payout): string {
	return `/gov payout GovCommerce ${payout.minecraftName} ${formatAmount(payout.total)} PayMe ${payoutLabel(payout.number)}`;
}

/** The private Payout message. Once settled, it shows who settled it in place of the Pay Command. */
function payoutEffect(payMe: PayMe, payout: Payout): Effect {
	const open = payout.state === 'open';
	const status = open ? payoutStateName(payout.state) : `**${payoutStateName(payout.state)}** by <@${payout.settledBy}>`;
	const requests = payout.lines.map((line) => requestLabel(line.requestNumber)).join(', ');
	return {
		type: 'show-payout',
		payoutNumber: payout.number,
		settleButtons: open,
		card: {
			tone: payoutTone(payout.state),
			title: `${payoutLabel(payout.number)} · ${payout.minecraftName}`,
			description: [`For <@${payout.employeeUserId}>`, '', ...breakdown(payMe, payout)].join('\n'),
			fields: [
				{ name: 'Total', value: `**${formatAmount(payout.total)}**`, inline: true },
				{ name: 'Status', value: status, inline: true },
				...(open ? [{ name: 'Pay Command', value: ['```', payCommand(payout), '```'].join('\n') }] : [])
			],
			footer: payout.state === 'discarded' ? `${requests} can be paid in a new Payout.` : undefined
		}
	};
}

function breakdown(payMe: PayMe, payout: Payout): string[] {
	const jobIds = [...new Set(payout.lines.map((line) => line.jobId))];
	return jobIds.flatMap((jobId) => {
		const lines = payout.lines.filter((line) => line.jobId === jobId);
		return [`**${getJob(payMe, jobId)!.name}**: ${formatAmount(sumOfRates(lines))}`, ...lines.map((line) => `- ${lineText(payMe, line)}`)];
	});
}

function lineText(payMe: PayMe, line: PayoutLine): string {
	return `**${requestLabel(line.requestNumber)}** ${getTask(payMe, line.taskId)!.name}: ${formatAmount(line.rate)}`;
}
