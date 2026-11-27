import {
	deleteUnpostedDisbursement,
	insertDisbursement,
	selectDisbursement,
	settleDisbursement,
	updateDisbursementCard
} from '../storage/disbursements';
import type { Actor } from './actor';
import type { Card, CardField, DisbursementAction, Effect, MessageRef } from './effects';
import { getEmployee, isValidMinecraftName } from './employees';
import { worksIn } from './job-membership';
import { getJob, type Job } from './jobs';
import { disbursementLabel, disbursementStateName, disbursementTone, type DisbursementState } from './labels';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { isLeadership } from './permissions';
import { formatAmount, parseRate } from './rates';
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
}

export function getDisbursement(payMe: PayMe, number: number): Disbursement | null {
	return selectDisbursement(payMe.storage, number);
}

export function requestDisbursement(payMe: PayMe, actor: Actor, input: NewDisbursement): Outcome<Disbursement> {
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
		if (category.builtIn || category.retired) return fail({ code: 'spending-category-unavailable', name: category.name });
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
		const disbursement = getDisbursement(payMe, number)!;
		return succeed([cardEffect(payMe, disbursement, 'post-disbursement')], disbursement);
	});
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
	return disbursement.settledBy ? `${state} by <@${disbursement.settledBy}>` : state;
}
