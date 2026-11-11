import { insertPayout, selectOpenPayout, selectPayout, selectPayoutsInState, selectUnpaidRequests, settlePayout } from '../storage/payouts';
import { updateRequestState } from '../storage/requests';
import type { Actor } from './actor';
import type { Effect, PayoutAction } from './effects';
import { getEmployee } from './employees';
import { allJobs, getJob, type Job } from './jobs';
import { payoutLabel, payoutStateName, requestLabel, type PayoutState } from './labels';
import { fail, succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { isLeadership, requireLeadership } from './permissions';
import { formatAmount } from './rates';
import { getPaymentRequest, updateReviewCopies } from './requests';
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

// Unpaid requests are estimated at current Rates; an Open Payout keeps its frozen total (ADR 0001).
export function owedTo(payMe: PayMe, employeeUserId: string): Owed {
	const { storage } = payMe;
	const unpaid = selectUnpaidRequests(storage, employeeUserId);
	return {
		unpaidRequestNumbers: unpaid.map((request) => request.number),
		estimatedTotal: unpaid.reduce((sum, request) => sum + getTask(payMe, request.taskId)!.rate, 0),
		openPayout: selectOpenPayout(storage, employeeUserId)
	};
}

export function totalOwed(owed: Owed): number {
	return owed.estimatedTotal + (owed.openPayout?.total ?? 0);
}

function owedAndHistory(payMe: PayMe, employeeUserIds?: readonly string[]): PayoutsView {
	const { storage } = payMe;
	const inScope = (userId: string) => !employeeUserIds || employeeUserIds.includes(userId);
	const owing = [...selectUnpaidRequests(storage), ...selectPayoutsInState(storage, 'open')].map((item) => item.employeeUserId);
	const owed = [...new Set(owing)].filter(inScope).map((userId) => ({
		employeeUserId: userId,
		minecraftName: getEmployee(payMe, userId)!.minecraftName,
		...owedTo(payMe, userId)
	}));
	owed.sort((a, b) => a.minecraftName.localeCompare(b.minecraftName));
	const history = selectPayoutsInState(storage, 'paid', 'discarded').filter((payout) => inScope(payout.employeeUserId));
	return { owed, history };
}

export function showPayouts(payMe: PayMe, actor: Actor, members: readonly Actor[]): Outcome<PayoutsView> {
	if (isLeadership(payMe, actor)) return leadershipView(payMe);

	const managed = allJobs(payMe).filter((job) => job.managerRoleIds.some((roleId) => actor.roleIds.includes(roleId)));
	if (managed.length === 0) return fail({ code: 'not-permitted' });

	const holders = members.filter((member) => holdsAnyJob(member, managed)).map((member) => member.userId);
	const view = owedAndHistory(payMe, [...holders, ...owedForJobs(payMe, managed)]);
	const history = view.history.map(historyText);
	const content = ['**Payouts** (read-only)', ...owedLines(view), '**Payout history**', ...(history.length ? history : ['No Payouts yet.'])].join(
		'\n'
	);
	return succeed([{ type: 'show-payouts', content, actions: [] }], view);
}

function holdsAnyJob(member: Actor, jobs: readonly Job[]): boolean {
	return jobs.some((job) => member.roleIds.includes(job.employeeRoleId));
}

function owedForJobs(payMe: PayMe, jobs: readonly Job[]): string[] {
	const { storage } = payMe;
	const locked = selectPayoutsInState(storage, 'open').flatMap((payout) => payout.lines.map((line) => line.requestNumber));
	return [...selectUnpaidRequests(storage).map((request) => request.number), ...locked]
		.map((number) => getPaymentRequest(payMe, number)!)
		.filter((request) => jobs.some((job) => request.eligibleJobIds.includes(job.id)))
		.map((request) => request.employeeUserId);
}

function leadershipView(payMe: PayMe): Outcome<PayoutsView> {
	const view = owedAndHistory(payMe);
	const actions = view.owed.map((employee): PayoutAction =>
		employee.openPayout
			? {
					kind: 'show',
					payoutNumber: employee.openPayout.number,
					label: `${payoutLabel(employee.openPayout.number)} for ${employee.minecraftName}`
				}
			: { kind: 'generate', employeeUserId: employee.employeeUserId, label: `Generate for ${employee.minecraftName}` }
	);
	const content = ['**Payouts**', ...owedLines(view)].join('\n');
	return succeed([{ type: 'show-payouts', content, actions }], view);
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
		const open = selectOpenPayout(storage, employeeUserId);
		if (open) return fail({ code: 'payout-already-open', number: open.number });

		const lines = selectUnpaidRequests(storage, employeeUserId).map((request) => ({
			requestNumber: request.number,
			taskId: request.taskId,
			jobId: request.jobId,
			rate: getTask(payMe, request.taskId)!.rate
		}));
		if (lines.length === 0) return fail({ code: 'nothing-owed' });
		const number = insertPayout(storage, { employeeUserId, minecraftName: employee.minecraftName, generatedBy: actor.userId, lines });
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
			updateRequestState(storage, line.requestNumber, { from: 'approved', to: 'paid', actorUserId: actor.userId, reason: null });
			return updateReviewCopies(payMe, getPaymentRequest(payMe, line.requestNumber)!);
		});
		const log = [
			`**${payoutLabel(number)}** paid by <@${actor.userId}>: ${formatAmount(payout.total)} to ${payout.minecraftName}`,
			...payout.lines.map((line) => `- ${lineText(payMe, line)}`)
		];
		effects.push(
			{ type: 'post-to-requests-thread', employeeUserId: payout.employeeUserId, content: log.join('\n'), ping: false },
			{ type: 'private-reply', content: `Marked ${payoutLabel(number)} paid.` }
		);
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
		const requests = payout.lines.map((line) => requestLabel(line.requestNumber)).join(', ');
		return succeed([{ type: 'private-reply', content: `Discarded ${payoutLabel(number)}. ${requests} can be paid in a new Payout.` }], payout);
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

function payoutEffect(payMe: PayMe, payout: Payout): Effect {
	const title = `**${payoutLabel(payout.number)}** for <@${payout.employeeUserId}> (${payout.minecraftName}): ${formatAmount(payout.total)}, ${payoutStateName(payout.state)}`;
	return {
		type: 'show-payout',
		payoutNumber: payout.number,
		content: [title, '```', payCommand(payout), '```', ...breakdown(payMe, payout)].join('\n')
	};
}

function breakdown(payMe: PayMe, payout: Payout): string[] {
	const jobIds = [...new Set(payout.lines.map((line) => line.jobId))];
	return jobIds.flatMap((jobId) => {
		const lines = payout.lines.filter((line) => line.jobId === jobId);
		const subtotal = lines.reduce((sum, line) => sum + line.rate, 0);
		return [`**${getJob(payMe, jobId)!.name}**: ${formatAmount(subtotal)}`, ...lines.map((line) => `- ${lineText(payMe, line)}`)];
	});
}

function lineText(payMe: PayMe, line: PayoutLine): string {
	return `**${requestLabel(line.requestNumber)}** ${getTask(payMe, line.taskId)!.name}: ${formatAmount(line.rate)}`;
}
