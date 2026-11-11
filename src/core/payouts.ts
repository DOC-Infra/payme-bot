import {
	insertPayout,
	selectOpenPayout,
	selectPayout,
	selectPayoutsInState,
	selectUnpaidRequests,
	settlePayout,
	type UnpaidRequestRow
} from '../storage/payouts';
import { updateRequestState } from '../storage/requests';
import type { Actor } from './actor';
import type { Effect, PayoutAction } from './effects';
import { getEmployee } from './employees';
import { allJobs, getJob } from './jobs';
import { payoutLabel, payoutStateName, requestLabel, type PayoutState } from './labels';
import { fail, succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { isLeadership, requireLeadership } from './permissions';
import { formatAmount } from './rates';
import { getPaymentRequest, updateReviewCopies } from './requests';
import { getTask } from './tasks';

/** One Payment Request in a Payout, with its Task, Job and Rate frozen at generation. */
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

/** An Employee who is owed money or has an Open Payout. The estimate uses current Rates (ADR 0001). */
export interface EmployeeOwed {
	employeeUserId: string;
	minecraftName: string;
	unpaidRequestNumbers: number[];
	estimatedTotal: number;
	openPayout: Payout | null;
}

export interface PayoutsView {
	owed: EmployeeOwed[];
	/** Paid and Discarded Payouts, newest first. */
	history: Payout[];
}

export function getPayout(payMe: PayMe, number: number): Payout | null {
	return selectPayout(payMe.storage, number);
}

/** Everyone owed money and every Paid Payout, optionally limited to some Employees. */
export function payoutsView(payMe: PayMe, employeeUserIds?: readonly string[]): PayoutsView {
	const { storage } = payMe;
	const inScope = ({ employeeUserId }: { employeeUserId: string }) => !employeeUserIds || employeeUserIds.includes(employeeUserId);
	const unpaid = selectUnpaidRequests(storage).filter(inScope);
	const open = selectPayoutsInState(storage, 'open').filter(inScope);
	const userIds = new Set([...unpaid, ...open].map((item) => item.employeeUserId));

	const owed = [...userIds].map((userId) => {
		const requests = unpaid.filter((request) => request.employeeUserId === userId);
		return {
			employeeUserId: userId,
			minecraftName: getEmployee(payMe, userId)!.minecraftName,
			unpaidRequestNumbers: requests.map((request) => request.number),
			estimatedTotal: estimate(payMe, requests),
			openPayout: open.find((payout) => payout.employeeUserId === userId) ?? null
		};
	});
	owed.sort((a, b) => a.minecraftName.localeCompare(b.minecraftName));
	return { owed, history: selectPayoutsInState(storage, 'paid', 'discarded').filter(inScope) };
}

/**
 * Leadership sees everyone, with buttons. A Manager sees, read-only, the `members` holding Jobs they manage,
 * plus their Payout history. `members` are the server's members, as the Discord layer sees them now.
 */
export function viewPayouts(payMe: PayMe, actor: Actor, members: readonly Actor[]): Outcome<PayoutsView> {
	if (isLeadership(payMe, actor)) return leadershipView(payMe);

	const managed = allJobs(payMe).filter((job) => job.managerRoleIds.some((roleId) => actor.roleIds.includes(roleId)));
	if (managed.length === 0) return fail({ code: 'not-permitted' });

	const team = members.filter((member) => managed.some((job) => member.roleIds.includes(job.employeeRoleId))).map((member) => member.userId);
	const view = payoutsView(payMe, team);
	const history = view.history.map(historyText);
	const content = ['**Payouts** (read-only)', ...owedLines(view), '**Payout history**', ...(history.length ? history : ['No Payouts yet.'])].join(
		'\n'
	);
	return succeed([{ type: 'show-payouts', content, actions: [] }], view);
}

function leadershipView(payMe: PayMe): Outcome<PayoutsView> {
	const view = payoutsView(payMe);
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

export function viewPayout(payMe: PayMe, actor: Actor, number: number): Outcome<Payout> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const payout = getPayout(payMe, number);
	if (!payout) return fail({ code: 'payout-not-found' });
	return succeed([showPayout(payMe, payout)], payout);
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

function estimate(payMe: PayMe, requests: readonly UnpaidRequestRow[]): number {
	return requests.reduce((sum, request) => sum + getTask(payMe, request.taskId)!.rate, 0);
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

		const lines = selectUnpaidRequests(storage)
			.filter((request) => request.employeeUserId === employeeUserId)
			.map((request) => ({
				requestNumber: request.number,
				taskId: request.taskId,
				jobId: request.jobId,
				rate: getTask(payMe, request.taskId)!.rate
			}));
		if (lines.length === 0) return fail({ code: 'nothing-owed' });
		const number = insertPayout(storage, { employeeUserId, minecraftName: employee.minecraftName, generatedBy: actor.userId, lines });
		const payout = selectPayout(storage, number)!;
		return succeed([showPayout(payMe, payout)], payout);
	});
}

export function markPayoutPaid(payMe: PayMe, actor: Actor, number: number): Outcome<Payout> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		if (!settlePayout(storage, number, 'paid', actor.userId)) return notOpen(payMe, number);

		const payout = selectPayout(storage, number)!;
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

		const payout = selectPayout(storage, number)!;
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

function showPayout(payMe: PayMe, payout: Payout): Effect {
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
