import type { NewRequest } from '../storage/requests';
import type { Actor } from './actor';
import type { EntryAction } from './effects';
import type { PayMeError } from './errors';
import { managesJob } from './job-membership';
import { getJob } from './jobs';
import type { RequestState } from './labels';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { requireLeadership } from './permissions';
import type { EvidenceItem, PaymentRequest } from './requests';

/** A change to an existing Payment Request. Submitting creates one, see `submit`. */
export type RequestChange = 'approve' | 'reject' | 'deny' | 'amend' | 'withdraw' | 'pay';

type StateRefusal = Extract<PayMeError, { state: RequestState }>['code'];

/**
 * Who may make a change: the Employee who owns the request; a reviewer, who manages one of its eligible Jobs (Leadership manages
 * them all) and is not its owner, though they may have filed it for the owner; or Leadership.
 */
type Party = 'owner' | 'reviewer' | 'leadership';

interface Rule {
	from: readonly RequestState[];
	to: RequestState;
	by: Party;
	/** Whether the actor must say why, recorded in the history entry. */
	needsReason?: true;
	/** The error when the request is in a state the change is not allowed from. */
	refusal: StateRefusal;
}

const rules: Record<RequestChange, Rule> = {
	approve: { from: ['pending'], to: 'approved', by: 'reviewer', refusal: 'already-decided' },
	reject: { from: ['pending'], to: 'rejected', by: 'reviewer', needsReason: true, refusal: 'already-decided' },
	deny: { from: ['pending'], to: 'denied', by: 'reviewer', needsReason: true, refusal: 'already-decided' },
	amend: { from: ['rejected'], to: 'pending', by: 'owner', refusal: 'cannot-amend' },
	withdraw: { from: ['pending', 'rejected'], to: 'withdrawn', by: 'owner', refusal: 'cannot-withdraw' },
	pay: { from: ['approved'], to: 'paid', by: 'leadership', refusal: 'cannot-pay' }
};

/** The changes the Employee makes with buttons on a request's Requests Thread entry, in the order the buttons appear. */
const entryButtons: readonly EntryAction[] = ['amend', 'withdraw'];

/** The buttons the Employee gets on the request's Requests Thread entry for `round`. Entries of earlier rounds have none. */
export function entryActions(request: PaymentRequest, round = request.round): EntryAction[] {
	if (round !== request.round) return [];
	return entryButtons.filter((change) => rules[change].from.includes(request.state));
}

/** Records a new Pending request. `actor` filed it: the Employee, or a Manager or Leadership on their behalf. */
export function submit(payMe: PayMe, actor: Actor, request: NewRequest): PaymentRequest {
	return payMe.requests.create(request, { state: 'pending', actorUserId: actor.userId });
}

/** Checks that the actor may make the change now, for example before showing them a form for it. */
export function checkChange(payMe: PayMe, actor: Actor, number: number, change: RequestChange): Outcome<PaymentRequest> {
	const request = payMe.requests.load(number);
	if (!request) return fail({ code: 'request-not-found' });
	const refused = refuseActor(payMe, actor, request, rules[change].by) ?? refuseState(request, change);
	if (refused) return refused;
	return succeed([], request);
}

/**
 * Makes the change if the actor may make it now, recording it in the request's history. An amendment's `resubmission` starts the
 * request's next round. Refused if someone else changed the request first.
 */
export function changeState(
	payMe: PayMe,
	actor: Actor,
	number: number,
	change: RequestChange,
	reason: string | null = null,
	resubmission?: readonly EvidenceItem[]
): Outcome<PaymentRequest> {
	const checked = checkChange(payMe, actor, number, change);
	if (!checked.ok) return checked;
	const { to, needsReason } = rules[change];
	const recorded = needsReason ? (reason?.trim() ?? '') : null;
	if (recorded === '') return fail({ code: 'reason-required' });

	const applied = payMe.requests.apply(number, { from: checked.value.state, to, actorUserId: actor.userId, reason: recorded, resubmission });
	if (!applied.saved) return refuseStale(applied.current, change);
	return succeed([], applied.request);
}

/** Someone else changed the request after it was checked, so the change was not saved. */
function refuseStale(current: PaymentRequest | null, change: RequestChange): Failure {
	if (!current) return fail({ code: 'request-not-found' });
	return fail({ code: rules[change].refusal, number: current.number, state: current.state });
}

function refuseState(request: PaymentRequest, change: RequestChange): Failure | null {
	const { from, refusal } = rules[change];
	return from.includes(request.state) ? null : fail({ code: refusal, number: request.number, state: request.state });
}

function refuseActor(payMe: PayMe, actor: Actor, request: PaymentRequest, party: Party): Failure | null {
	if (party === 'leadership') return requireLeadership(payMe, actor);
	const owner = request.employeeUserId === actor.userId;
	if (party === 'owner') return owner ? null : fail({ code: 'not-your-request' });
	if (owner) return fail({ code: 'own-request' });
	return reviews(payMe, actor, request) ? null : fail({ code: 'not-a-reviewer' });
}

function reviews(payMe: PayMe, actor: Actor, request: PaymentRequest): boolean {
	return request.eligibleJobIds.some((jobId) => {
		const job = getJob(payMe, jobId);
		return job !== null && managesJob(payMe, actor, job);
	});
}
