import {
	deleteUnpostedDisbursement,
	insertDisbursement,
	selectDisbursement,
	selectDisbursements,
	selectDisbursementsInState,
	settleDisbursement,
	updateDisbursementCard,
	voidPaidDisbursement
} from '../storage/disbursements';
import type { Actor } from './actor';
import { overSpentWarning, overTargetWarning } from './appropriation';
import { monthName, monthOf, parseMonth } from './months';
import type { Card, CardField, DisbursementAction, DisbursementDecision, DisbursementReasonAction, Effect, MessageRef } from './effects';
import { getEmployee, isValidMinecraftName } from './employees';
import { worksIn } from './job-membership';
import { getJob, type Job } from './jobs';
import { disbursementLabel, disbursementStateName, disbursementTone, type DisbursementState } from './labels';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { isLeadership, requireLeadership } from './permissions';
import { formatAmount, parseRate, plainAmount } from './rates';
import { isValidLink } from './requests';
import { allSpendingCategories, getSpendingCategory, type SpendingCategory } from './spending-categories';

export interface Disbursement {
	number: number;
	categoryId: number;
	/** The Job it was requested under, or null when Leadership requested it holding none of the Category's Jobs. */
	jobId: number | null;
	recipient: string;
	amount: number;
	reason: string;
	link: string | null;
	state: DisbursementState;
	requestedBy: string;
	requestedAt: string;
	settledBy: string | null;
	settledAt: string | null;
	/** Why it was Declined or Voided. */
	outcomeReason: string | null;
	/** Voiding keeps who paid it and when in `settledBy` and `settledAt`. */
	voidedBy: string | null;
	voidedAt: string | null;
	channelId: string | null;
	messageId: string | null;
}

export interface NewDisbursement {
	categoryId: number;
	/** Needed only when more than one of the requester's Jobs may draw on the Category. */
	jobId?: number;
	recipient: string;
	amount: string;
	reason: string;
	link: string | null;
	/** Leadership only: records one already paid outside PayMe on this day (YYYY-MM-DD), posting its card Paid. */
	paidOn?: string | null;
}

export function getDisbursement(payMe: PayMe, number: number): Disbursement | null {
	return selectDisbursement(payMe.storage, number);
}

export function requestDisbursement(payMe: PayMe, actor: Actor, input: NewDisbursement, now = new Date()): Outcome<Disbursement> {
	let paidAt: string | null = null;
	if (input.paidOn) {
		if (!isLeadership(payMe, actor)) return fail({ code: 'not-permitted' });
		paidAt = paidDate(input.paidOn, now);
		if (paidAt === null) return fail({ code: 'invalid-paid-date', date: input.paidOn });
	}
	const amount = parseRate(input.amount);
	if (amount === null) return fail({ code: 'invalid-amount', amount: input.amount });
	const recipient = input.recipient.trim();
	if (!isValidMinecraftName(recipient)) return fail({ code: 'invalid-minecraft-name', name: recipient });
	const reason = input.reason.trim();
	if (!reason) return fail({ code: 'reason-required' });
	const link = input.link?.trim() || null;
	if (link !== null && !isValidLink(link)) return fail({ code: 'invalid-link', link });

	const { storage } = payMe;
	return storage.transaction(() => {
		const category = getSpendingCategory(payMe, input.categoryId);
		if (!category) return fail({ code: 'spending-category-not-found' });
		// A payment already made may be recorded from a Category Retired since.
		if (category.builtIn || (category.retired && !paidAt)) return fail({ code: 'spending-category-unavailable', name: category.name });
		const job = pickJob(payMe, actor, category, input.jobId);
		if (job !== null && 'ok' in job) return job;
		if (!isLeadership(payMe, actor) && getEmployee(payMe, actor.userId)?.minecraftName.toLowerCase() === recipient.toLowerCase()) {
			return fail({ code: 'own-disbursement' });
		}

		const number = insertDisbursement(storage, {
			categoryId: category.id,
			jobId: job?.id ?? null,
			recipient,
			amount,
			reason,
			link,
			requestedBy: actor.userId
		});
		if (paidAt) settleDisbursement(storage, number, 'paid', actor.userId, null, paidAt);
		const disbursement = getDisbursement(payMe, number)!;
		const warnings = paidAt && monthOf(paidAt) === monthOf(now) ? paidWarnings(payMe, disbursement) : [];
		return succeed([cardEffect(payMe, disbursement, 'post-disbursement'), ...warnings], disbursement);
	});
}

/** The start of the day in UTC, when it is a real day from 2000 to today. */
function paidDate(text: string, now: Date): string | null {
	if (!/^2\d{3}-\d{2}-\d{2}$/.test(text)) return null;
	const day = new Date(`${text}T00:00:00.000Z`);
	if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== text) return null;
	return text <= now.toISOString().slice(0, 10) ? day.toISOString() : null;
}

/** The Categories the actor can request a Disbursement from. */
export function requestableCategories(payMe: PayMe, actor: Actor): SpendingCategory[] {
	return allSpendingCategories(payMe).filter(
		(category) => !category.builtIn && !category.retired && (isLeadership(payMe, actor) || jobsRequestableFrom(payMe, actor, category).length > 0)
	);
}

/** The Category's active Jobs the actor holds or manages, any of which they could request under. */
export function jobsRequestableFrom(payMe: PayMe, actor: Actor, category: SpendingCategory): Job[] {
	return activeJobsOf(payMe, category).filter((job) => worksIn(actor, job));
}

function activeJobsOf(payMe: PayMe, category: SpendingCategory): Job[] {
	return category.jobIds.map((id) => getJob(payMe, id)!).filter((job) => !job.retired);
}

/** Forgets a Disbursement whose card could not be posted, so it isn't left Requested where nobody can see or withdraw it. */
export function discardUnpostedDisbursement(payMe: PayMe, number: number): void {
	deleteUnpostedDisbursement(payMe.storage, number);
}

/** The requester or Leadership can withdraw a Disbursement while it is Requested. */
export function withdrawDisbursement(payMe: PayMe, actor: Actor, number: number): Outcome<Disbursement> {
	const { storage } = payMe;
	return storage.transaction(() => {
		const disbursement = getDisbursement(payMe, number);
		if (!disbursement) return fail({ code: 'disbursement-not-found' });
		if (disbursement.requestedBy !== actor.userId && !isLeadership(payMe, actor)) return fail({ code: 'not-your-disbursement' });
		if (!settleDisbursement(storage, number, 'withdrawn', actor.userId)) {
			return fail({ code: 'cannot-withdraw-disbursement', number, state: disbursement.state });
		}

		const withdrawn = getDisbursement(payMe, number)!;
		return succeed([cardEffect(payMe, withdrawn, 'update-disbursement')], withdrawn);
	});
}

export function paidDisbursements(payMe: PayMe): Disbursement[] {
	return selectDisbursementsInState(payMe.storage, 'paid');
}

export function voidedDisbursements(payMe: PayMe): Disbursement[] {
	return selectDisbursementsInState(payMe.storage, 'voided');
}

/**
 * The month's Disbursements for Leadership, by date: those paid, declined, withdrawn or voided in it, and, for the current month,
 * those still Requested.
 */
export function appropriationDisbursements(payMe: PayMe, actor: Actor, monthText: string, now = new Date()): Outcome<Disbursement[]> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const month = parseMonth(monthText);
	if (!month) return fail({ code: 'invalid-month', month: monthText });

	const inMonth = selectDisbursements(payMe.storage)
		.filter((each) => (each.settledAt === null ? month === monthOf(now) : monthOf(each.settledAt) === month))
		.sort((a, b) => (a.settledAt ?? a.requestedAt).localeCompare(b.settledAt ?? b.requestedAt) || a.number - b.number);
	const lines = inMonth.map((each) => {
		const category = getSpendingCategory(payMe, each.categoryId)!.name;
		return `- **${disbursementLabel(each.number)}** ${category} · ${each.recipient} · ${formatAmount(each.amount)} · ${disbursementStateName(each.state)}`;
	});
	const card: Card = {
		tone: 'info',
		title: `Disbursements · ${monthName(month)}`,
		description: lines.length ? lines.join('\n') : 'No Disbursements.'
	};
	return succeed([{ type: 'show-disbursements', card, disbursementNumbers: inMonth.map((each) => each.number) }], inMonth);
}

/** Disbursements waiting for Leadership to pay or decline them, oldest first. */
export function requestedDisbursements(payMe: PayMe): Disbursement[] {
	return selectDisbursementsInState(payMe.storage, 'requested');
}

export interface DisbursementGroup {
	category: string;
	items: Disbursement[];
}

/** Requested Disbursements grouped by Spending Category, Categories by name. */
export function requestedDisbursementGroups(payMe: PayMe): DisbursementGroup[] {
	const groups = new Map<string, Disbursement[]>();
	for (const disbursement of requestedDisbursements(payMe)) {
		const name = getSpendingCategory(payMe, disbursement.categoryId)!.name;
		groups.set(name, [...(groups.get(name) ?? []), disbursement]);
	}
	return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => ({ category, items }));
}

export function disbursementGroupLines(groups: readonly DisbursementGroup[]): string[] {
	if (groups.length === 0) return [];
	return [
		'',
		'**Disbursements**',
		...groups.flatMap(({ category, items }) => [
			`__${category}__`,
			...items.map((item) => `- **${disbursementLabel(item.number)}** to ${item.recipient}: ${formatAmount(item.amount)} (${item.reason})`)
		])
	];
}

/** The Disbursement privately for Leadership, with its Pay Command while it is Requested. */
export function showDisbursement(payMe: PayMe, actor: Actor, number: number): Outcome<Disbursement> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const disbursement = getDisbursement(payMe, number);
	if (!disbursement) return fail({ code: 'disbursement-not-found' });
	return succeed([privateEffect(payMe, disbursement)], disbursement);
}

/** Refuses before Leadership is asked for a reason, when the Disbursement can no longer be declined or voided. */
export function checkDisbursementChange(payMe: PayMe, actor: Actor, number: number, action: DisbursementReasonAction): Failure | null {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const disbursement = getDisbursement(payMe, number);
	if (!disbursement) return fail({ code: 'disbursement-not-found' });
	if (decisionsFor(disbursement).includes(action)) return null;
	const { state } = disbursement;
	return fail(action === 'void' ? { code: 'cannot-void', number, state } : { code: 'disbursement-decided', number, state });
}

/** Leadership voids a Paid Disbursement recorded wrongly: it stays visible but is no longer Spend, even in an earlier month. */
export function voidDisbursement(payMe: PayMe, actor: Actor, number: number, reasonText: string): Outcome<Disbursement> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const reason = reasonText.trim();
	if (!reason) return fail({ code: 'reason-required' });

	const { storage } = payMe;
	return storage.transaction(() => {
		const disbursement = getDisbursement(payMe, number);
		if (!disbursement) return fail({ code: 'disbursement-not-found' });
		if (!voidPaidDisbursement(storage, number, actor.userId, reason)) return fail({ code: 'cannot-void', number, state: disbursement.state });

		const voided = getDisbursement(payMe, number)!;
		return succeed([cardEffect(payMe, voided, 'update-disbursement'), privateEffect(payMe, voided)], voided);
	});
}

export function markDisbursementPaid(payMe: PayMe, actor: Actor, number: number): Outcome<Disbursement> {
	return decide(payMe, actor, number, 'paid', null);
}

export function declineDisbursement(payMe: PayMe, actor: Actor, number: number, reasonText: string): Outcome<Disbursement> {
	const reason = reasonText.trim();
	if (!reason) return fail({ code: 'reason-required' });
	return decide(payMe, actor, number, 'declined', reason);
}

function decide(payMe: PayMe, actor: Actor, number: number, to: 'paid' | 'declined', reason: string | null): Outcome<Disbursement> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	const { storage } = payMe;
	return storage.transaction(() => {
		const disbursement = getDisbursement(payMe, number);
		if (!disbursement) return fail({ code: 'disbursement-not-found' });
		if (!settleDisbursement(storage, number, to, actor.userId, reason))
			return fail({ code: 'disbursement-decided', number, state: disbursement.state });

		const decided = getDisbursement(payMe, number)!;
		const warnings = to === 'paid' ? paidWarnings(payMe, decided) : [];
		return succeed([cardEffect(payMe, decided, 'update-disbursement'), privateEffect(payMe, decided), ...warnings], decided);
	});
}

/** The month's over-Appropriation and over-target warnings once it is paid (ADR 0003). */
function paidWarnings(payMe: PayMe, disbursement: Disbursement): Effect[] {
	return [...overSpentWarning(payMe), ...overTargetWarning(payMe, disbursement.categoryId)];
}

function disbursementPayCommand(disbursement: Disbursement, category: SpendingCategory): string {
	return `/gov payout GovCommerce ${disbursement.recipient} ${plainAmount(disbursement.amount)} ${category.name}`;
}

function privateEffect(payMe: PayMe, disbursement: Disbursement): Effect {
	const category = getSpendingCategory(payMe, disbursement.categoryId)!;
	const card = disbursementCard(payMe, disbursement, category);
	const requested = disbursement.state === 'requested';
	if (requested)
		card.fields = [
			...(card.fields ?? []),
			{ name: 'Pay Command', value: ['```', disbursementPayCommand(disbursement, category), '```'].join('\n') }
		];
	return { type: 'show-disbursement', disbursementNumber: disbursement.number, card, actions: decisionsFor(disbursement) };
}

function decisionsFor(disbursement: Disbursement): DisbursementDecision[] {
	if (disbursement.state === 'requested') return ['paid', 'decline'];
	return disbursement.state === 'paid' ? ['void'] : [];
}

export function recordDisbursementCard(payMe: PayMe, number: number, card: MessageRef): void {
	updateDisbursementCard(payMe.storage, number, card.channelId, card.messageId);
}

/**
 * The Job the Disbursement is requested under: the one given, or the only one of the Category's Jobs the actor holds or manages.
 * Leadership holding none of them requests under no Job.
 */
function pickJob(payMe: PayMe, actor: Actor, category: SpendingCategory, jobId: number | undefined): Job | Failure | null {
	const jobs = jobsRequestableFrom(payMe, actor, category);
	const refused = fail({ code: 'disbursement-not-allowed', category: category.name });
	if (jobId !== undefined) {
		const offered = isLeadership(payMe, actor) ? activeJobsOf(payMe, category) : jobs;
		return offered.find((job) => job.id === jobId) ?? refused;
	}
	if (jobs.length > 1) return fail({ code: 'disbursement-job-required', category: category.name });
	if (jobs.length === 1) return jobs[0];
	return isLeadership(payMe, actor) ? null : refused;
}

function cardEffect(payMe: PayMe, disbursement: Disbursement, type: 'post-disbursement' | 'update-disbursement'): Effect {
	const category = getSpendingCategory(payMe, disbursement.categoryId)!;
	return {
		type,
		disbursementNumber: disbursement.number,
		card: disbursementCard(payMe, disbursement, category),
		actions: actionsFor(disbursement)
	};
}

function actionsFor(disbursement: Disbursement): DisbursementAction[] {
	return disbursement.state === 'requested' ? ['withdraw'] : [];
}

function disbursementCard(payMe: PayMe, disbursement: Disbursement, category: SpendingCategory): Card {
	const job = disbursement.jobId === null ? null : getJob(payMe, disbursement.jobId);
	const fields: CardField[] = [
		{ name: 'Recipient', value: disbursement.recipient, inline: true },
		{ name: 'Amount', value: formatAmount(disbursement.amount), inline: true },
		{ name: 'Requested by', value: `<@${disbursement.requestedBy}>${job ? ` (${job.name})` : ''}`, inline: true },
		{ name: 'Reason', value: disbursement.reason },
		...(disbursement.link ? [{ name: 'Link', value: disbursement.link }] : []),
		{ name: 'State', value: stateText(disbursement) }
	];
	return { tone: disbursementTone(disbursement.state), title: `${disbursementLabel(disbursement.number)} · ${category.name}`, fields };
}

function stateText(disbursement: Disbursement): string {
	const state = `**${disbursementStateName(disbursement.state)}**`;
	const actor = disbursement.voidedBy ?? disbursement.settledBy;
	const by = actor ? `${state} by <@${actor}>` : state;
	if (disbursement.outcomeReason) return `${by}: ${disbursement.outcomeReason}`;
	return disbursement.state === 'paid' ? `${by} on ${disbursement.settledAt!.slice(0, 10)}` : by;
}
