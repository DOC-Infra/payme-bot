import { insertPayout, replaceOpenPayout, selectOpenPayout, selectPayout, selectPayoutsInState, settlePayout } from '../storage/payouts';
import { markSharesPaid, selectUnpaidShares } from '../storage/projects';
import type { Actor } from './actor';
import { overSpentWarning, overTargetWarning } from './appropriation';
import { notice, type Card, type Effect, type PayoutAction } from './effects';
import { getEmployee } from './employees';
import { jobsHeldBy, jobsManagedBy } from './job-membership';
import { changeState } from './lifecycle';
import { getJob, type Job } from './jobs';
import { disbursementLabel, payoutLabel, payoutStateName, payoutTone, requestLabel, shareLabel, type PayoutState } from './labels';
import { fail, succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { isLeadership, requireLeadership } from './permissions';
import { getProject, type Share } from './projects';
import { formatAmount, plainAmount } from './rates';
import { updateReviewCopies, type PaymentRequest } from './requests';
import { employeePayId } from './spending-categories';
import { disbursementGroupLines, requestedDisbursementGroups } from './disbursements';
import { getTask } from './tasks';

export interface PayoutLine {
	requestNumber: number;
	taskId: number;
	jobId: number;
	rate: number;
}

/** A Share frozen into a Payout. */
export interface PayoutShareLine {
	shareId: number;
	projectId: number;
	jobId: number;
	amount: number;
}

export interface Payout {
	number: number;
	employeeUserId: string;
	minecraftName: string;
	total: number;
	state: PayoutState;
	/** 1 when generated, and one more each time it is updated while Open. */
	revision: number;
	lines: PayoutLine[];
	shares: PayoutShareLine[];
	generatedBy: string;
	generatedAt: string;
	settledBy: string | null;
	settledAt: string | null;
}

export interface Owed {
	unpaidRequestNumbers: number[];
	estimatedTotal: number;
	unpaidShareIds: number[];
	/** Shares are fixed amounts, so unlike requests their total is exact. */
	sharesTotal: number;
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

export function paidPayouts(payMe: PayMe): Payout[] {
	return selectPayoutsInState(payMe.storage, 'paid');
}

interface Owing {
	approved: PaymentRequest[];
	unpaid: PaymentRequest[];
	openPayouts: Payout[];
	rates: ReadonlyMap<number, number>;
	/** Every Share not yet paid, including those locked in an Open Payout. */
	shares: Share[];
	unpaidShares: Share[];
}

function loadOwing(payMe: PayMe, employeeUserId?: string): Owing {
	const approved = payMe.requests.loadMany({ employeeUserId, states: ['approved'] });
	const openPayouts = loadOpenPayouts(payMe, employeeUserId);
	const unpaid = unpaidRequests(approved, openPayouts);
	const shares = selectUnpaidShares(payMe.storage, employeeUserId);
	const lockedShares = new Set(openPayouts.flatMap((payout) => payout.shares.map((line) => line.shareId)));
	const unpaidShares = shares.filter((share) => !lockedShares.has(share.id));
	return { approved, unpaid, openPayouts, rates: currentRates(payMe, approved), shares, unpaidShares };
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
	if (request.eligibleJobIds.length === 0) throw new Error(`${requestLabel(request.number)} is eligible under no Job, so it has no Payout line`);
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

function sumOfAmounts(lines: readonly { amount: number }[]): number {
	return lines.reduce((sum, line) => sum + line.amount, 0);
}

// Unpaid requests are estimated at current Rates; an Open Payout keeps its frozen total (ADR 0001).
function owedFrom(owing: Owing, employeeUserId: string): Owed {
	const unpaid = owing.unpaid.filter((request) => request.employeeUserId === employeeUserId);
	const shares = owing.unpaidShares.filter((share) => share.employeeUserId === employeeUserId);
	return {
		unpaidRequestNumbers: unpaid.map((request) => request.number),
		estimatedTotal: unpaid.reduce((sum, request) => sum + rateOf(owing, request), 0),
		unpaidShareIds: shares.map((share) => share.id),
		sharesTotal: sumOfAmounts(shares),
		openPayout: owing.openPayouts.find((payout) => payout.employeeUserId === employeeUserId) ?? null
	};
}

/** What everyone is owed together, for the dashboard. */
export interface OwedSummary {
	/** How many Employees are owed requests or Shares not yet in an Open Payout. */
	employees: number;
	/** Unpaid Approved requests at current Rates, plus unpaid Shares, not yet in an Open Payout. */
	total: number;
	/** The part of `total` that is Approved requests at current Rates, and so only an estimate (ADR 0001). */
	estimated: number;
	/** The same, by the Job each would be paid under. A request eligible under no Job counts only in `total`. */
	byJob: ReadonlyMap<number, number>;
	openPayouts: Payout[];
}

export function owedSummary(payMe: PayMe): OwedSummary {
	const owing = loadOwing(payMe);
	const byJob = new Map<number, number>();
	const add = (jobId: number, amount: number) => byJob.set(jobId, (byJob.get(jobId) ?? 0) + amount);
	for (const request of owing.unpaid) if (request.eligibleJobIds.length > 0) add(lineJobId(request), rateOf(owing, request));
	for (const share of owing.unpaidShares) add(share.jobId, share.amount);
	const items = [...owing.unpaid, ...owing.unpaidShares];
	const estimated = owing.unpaid.reduce((sum, request) => sum + rateOf(owing, request), 0);
	return {
		employees: new Set(items.map((item) => item.employeeUserId)).size,
		total: estimated + sumOfAmounts(owing.unpaidShares),
		estimated,
		byJob,
		openPayouts: owing.openPayouts
	};
}

export function owedTo(payMe: PayMe, employeeUserId: string): Owed {
	return owedFrom(loadOwing(payMe, employeeUserId), employeeUserId);
}

export function totalOwed(owed: Owed): number {
	return owed.estimatedTotal + owed.sharesTotal + (owed.openPayout?.total ?? 0);
}

function owedAndHistory(payMe: PayMe, owing: Owing, employeeUserIds?: readonly string[]): PayoutsView {
	const inScope = (userId: string) => !employeeUserIds || employeeUserIds.includes(userId);
	const owingUserIds = [...owing.unpaid, ...owing.unpaidShares, ...owing.openPayouts].map((item) => item.employeeUserId);
	const owed = [...new Set(owingUserIds)].filter(inScope).map((userId) => ({
		employeeUserId: userId,
		minecraftName: getEmployee(payMe, userId)!.minecraftName,
		...owedFrom(owing, userId)
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

// Every Approved request and unpaid Share is either unpaid or locked in an Open Payout, so all of them are owed.
function owedForJobs(owing: Owing, jobs: readonly Job[]): string[] {
	const requests = owing.approved.filter((request) => jobs.some((job) => request.eligibleJobIds.includes(job.id)));
	const shares = owing.shares.filter((share) => jobs.some((job) => job.id === share.jobId));
	return [...requests, ...shares].map((item) => item.employeeUserId);
}

function leadershipView(payMe: PayMe): Outcome<PayoutsView> {
	const view = owedAndHistory(payMe, loadOwing(payMe));
	const disbursements = requestedDisbursementGroups(payMe);
	const employeeActions = view.owed.map((employee): PayoutAction =>
		employee.openPayout && !owesMore(employee)
			? {
					kind: 'show',
					payoutNumber: employee.openPayout.number,
					label: `${payoutLabel(employee.openPayout.number)} for ${employee.minecraftName}`
				}
			: { kind: 'generate', employeeUserId: employee.employeeUserId, label: generateLabel(employee) }
	);
	const disbursementActions = disbursements.flatMap(({ items }) =>
		items.map((item): PayoutAction => ({
			kind: 'disbursement',
			disbursementNumber: item.number,
			label: `${disbursementLabel(item.number)} to ${item.recipient}`
		}))
	);
	const description = [...owedLines(view), ...disbursementGroupLines(disbursements)].join('\n');
	return succeed(
		[{ type: 'show-payouts', card: { tone: 'info', title: 'Payouts', description }, actions: [...employeeActions, ...disbursementActions] }],
		view
	);
}

/** Owed something not yet in their Open Payout, if they have one. */
function owesMore(employee: EmployeeOwed): boolean {
	return employee.unpaidRequestNumbers.length > 0 || employee.unpaidShareIds.length > 0;
}

function generateLabel(employee: EmployeeOwed): string {
	if (!employee.openPayout) return `Generate for ${employee.minecraftName}`;
	return `Update ${payoutLabel(employee.openPayout.number)} for ${employee.minecraftName}`;
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
	if (employee.unpaidShareIds.length) {
		parts.push(`${formatAmount(employee.sharesTotal)} owed for Shares ${employee.unpaidShareIds.map(shareLabel).join(', ')}`);
	}
	return parts.join('; ');
}

export function generatePayout(payMe: PayMe, actor: Actor, employeeUserId: string): Outcome<Payout> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		if (!getEmployee(payMe, employeeUserId)) return fail({ code: 'employee-not-found' });
		const payout = writePayout(payMe, actor, loadOwing(payMe, employeeUserId), employeeUserId);
		if (!payout) return fail({ code: 'nothing-owed' });
		return succeed([payoutEffect(payMe, payout)], payout);
	});
}

/**
 * Generates a Payout for every Employee who is owed something, then shows them all so Leadership can run each Pay Command and
 * mark it paid. An Employee's Open Payout is updated in place to take in everything they are owed now.
 */
export function generateAllPayouts(payMe: PayMe, actor: Actor): Outcome<Payout[]> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	return payMe.storage.transaction(() => {
		const owing = loadOwing(payMe);
		const owedUserIds = new Set([...owing.approved, ...owing.shares].map((item) => item.employeeUserId));
		const payouts = [...owedUserIds]
			.flatMap((userId) => writePayout(payMe, actor, owingOf(owing, userId), userId) ?? [])
			.sort((a, b) => a.number - b.number);
		if (payouts.length === 0) return succeed([{ type: 'private-reply', card: notice('Nobody is owed anything.', 'neutral') }], payouts);

		const updated = owing.openPayouts.length;
		const generated = payouts.length - updated;
		const total = payouts.reduce((sum, payout) => sum + payout.total, 0);
		const counts = [
			generated ? `generated ${generated} ${generated === 1 ? 'Payout' : 'Payouts'}` : '',
			updated ? `updated ${updated} Open ${updated === 1 ? 'Payout' : 'Payouts'}` : ''
		].filter(Boolean);
		const done = counts.join(' and ');
		const summary = `${done[0].toUpperCase()}${done.slice(1)}. ${formatAmount(total)} to pay in all; run each Pay Command below, then mark it paid.`;
		return succeed([{ type: 'private-reply', card: notice(summary, 'info') }, ...payouts.map((payout) => payoutEffect(payMe, payout))], payouts);
	});
}

/** What `loadOwing` found, narrowed to one Employee. */
function owingOf(owing: Owing, employeeUserId: string): Owing {
	const mine = <T extends { employeeUserId: string }>(items: readonly T[]) => items.filter((item) => item.employeeUserId === employeeUserId);
	return {
		...owing,
		approved: mine(owing.approved),
		unpaid: mine(owing.unpaid),
		openPayouts: mine(owing.openPayouts),
		shares: mine(owing.shares),
		unpaidShares: mine(owing.unpaidShares)
	};
}

/**
 * Freezes everything the Employee is owed now, at current Rates, into their Open Payout, or a new one when they have none.
 * Returns null when they are owed nothing.
 */
function writePayout(payMe: PayMe, actor: Actor, owing: Owing, employeeUserId: string): Payout | null {
	const lines = owing.approved.map((request): PayoutLine => ({
		requestNumber: request.number,
		taskId: request.taskId,
		jobId: lineJobId(request),
		rate: rateOf(owing, request)
	}));
	const shares = owing.shares.map(({ id, projectId, jobId, amount }): PayoutShareLine => ({ shareId: id, projectId, jobId, amount }));
	if (lines.length === 0 && shares.length === 0) return null;
	const { minecraftName } = getEmployee(payMe, employeeUserId)!;
	const payout = { employeeUserId, minecraftName, generatedBy: actor.userId, total: sumOfRates(lines) + sumOfAmounts(shares), lines, shares };
	const [open] = owing.openPayouts;
	if (!open) return getPayout(payMe, insertPayout(payMe.storage, payout))!;
	// Nothing settles a Payout outside this transaction, so an Open one staying Open is guaranteed. Throwing rolls everything back.
	if (!replaceOpenPayout(payMe.storage, open.number, payout)) throw new Error(`${payoutLabel(open.number)} is no longer Open`);
	return getPayout(payMe, open.number)!;
}

/** `revision` is the version of the Payout that was shown, so an older Pay Command can't be marked paid as the latest one. */
export function markPayoutPaid(payMe: PayMe, actor: Actor, number: number, revision: number): Outcome<Payout> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		const stale = staleRevision(payMe, number, revision);
		if (stale) return stale;
		if (!settlePayout(storage, number, 'paid', actor.userId)) return notOpen(payMe, number);

		const payout = getPayout(payMe, number)!;
		const effects: Effect[] = payout.lines.map((line) => {
			const paid = changeState(payMe, actor, line.requestNumber, 'pay');
			// Nothing changes a request while it is in an Open Payout, so a refusal is a bug. Throwing rolls the Payout back too.
			if (!paid.ok) throw new Error(`Cannot pay ${requestLabel(line.requestNumber)} in ${payoutLabel(number)}: ${paid.error.code}`);
			return updateReviewCopies(payMe, paid.value);
		});
		const shareIds = payout.shares.map((line) => line.shareId);
		// Nothing else pays a Share in an Open Payout, so a mismatch is a bug. Throwing rolls the Payout back too.
		if (markSharesPaid(storage, shareIds) !== shareIds.length) throw new Error(`Cannot pay every Share in ${payoutLabel(number)}`);
		const log: Card = {
			tone: 'success',
			title: `${payoutLabel(number)} paid`,
			description: [
				`Paid by <@${actor.userId}>: **${formatAmount(payout.total)}** to ${payout.minecraftName}`,
				...payout.lines.map((line) => `- ${lineText(payMe, line)}`),
				...payout.shares.map((line) => `- ${shareLineText(payMe, line)}`)
			].join('\n')
		};
		effects.push(
			{ type: 'post-to-requests-thread', employeeUserId: payout.employeeUserId, card: log, ping: false },
			payoutEffect(payMe, payout),
			...overSpentWarning(payMe),
			...overTargetWarning(payMe, employeePayId)
		);
		return succeed(effects, payout);
	});
}

export function discardPayout(payMe: PayMe, actor: Actor, number: number, revision: number): Outcome<Payout> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		const stale = staleRevision(payMe, number, revision);
		if (stale) return stale;
		if (!settlePayout(storage, number, 'discarded', actor.userId)) return notOpen(payMe, number);

		const payout = getPayout(payMe, number)!;
		return succeed([payoutEffect(payMe, payout)], payout);
	});
}

/** Refuses an Open Payout that has been updated since `revision` was shown. */
function staleRevision(payMe: PayMe, number: number, revision: number) {
	const payout = getPayout(payMe, number);
	if (!payout || payout.state !== 'open' || payout.revision === revision) return null;
	return fail({ code: 'payout-updated', number });
}

function notOpen(payMe: PayMe, number: number) {
	const payout = getPayout(payMe, number);
	if (!payout) return fail({ code: 'payout-not-found' });
	return fail({ code: 'payout-not-open', number, state: payout.state });
}

export function payCommand(payout: Payout): string {
	return `/gov payout GovCommerce ${payout.minecraftName} ${plainAmount(payout.total)} PayMe ${payoutLabel(payout.number)}`;
}

/** The private Payout message. Once settled, it shows who settled it in place of the Pay Command. */
function payoutEffect(payMe: PayMe, payout: Payout): Effect {
	const open = payout.state === 'open';
	const status = open ? payoutStateName(payout.state) : `**${payoutStateName(payout.state)}** by <@${payout.settledBy}>`;
	const requests = [...payout.lines.map((line) => requestLabel(line.requestNumber)), ...payout.shares.map((line) => shareLabel(line.shareId))].join(
		', '
	);
	return {
		type: 'show-payout',
		payoutNumber: payout.number,
		revision: payout.revision,
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
	const jobIds = [...new Set([...payout.lines, ...payout.shares].map((line) => line.jobId))];
	return jobIds.flatMap((jobId) => {
		const lines = payout.lines.filter((line) => line.jobId === jobId);
		const shares = payout.shares.filter((line) => line.jobId === jobId);
		return [
			`**${getJob(payMe, jobId)!.name}**: ${formatAmount(sumOfRates(lines) + sumOfAmounts(shares))}`,
			...lines.map((line) => `- ${lineText(payMe, line)}`),
			...shares.map((line) => `- ${shareLineText(payMe, line)}`)
		];
	});
}

function shareLineText(payMe: PayMe, line: PayoutShareLine): string {
	return `**${shareLabel(line.shareId)}** ${getProject(payMe, line.projectId)!.name} Project: ${formatAmount(line.amount)}`;
}

function lineText(payMe: PayMe, line: PayoutLine): string {
	return `**${requestLabel(line.requestNumber)}** ${getTask(payMe, line.taskId)!.name}: ${formatAmount(line.rate)}`;
}
