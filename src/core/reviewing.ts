import { updateRequestState } from '../storage/requests';
import type { Actor } from './actor';
import { getJob } from './jobs';
import { fail, succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { isLeadership } from './permissions';
import {
	getPaymentRequest,
	logStateChange,
	requestLabel,
	stateName,
	updateEntryActions,
	updateReviewCopies,
	type PaymentRequest,
	type RequestState
} from './requests';

export function approveRequest(payMe: PayMe, actor: Actor, number: number): Outcome<PaymentRequest> {
	return decide(payMe, actor, number, 'approved', null);
}

export function rejectRequest(payMe: PayMe, actor: Actor, number: number, reason: string): Outcome<PaymentRequest> {
	return decideWithReason(payMe, actor, number, 'rejected', reason);
}

export function denyRequest(payMe: PayMe, actor: Actor, number: number, reason: string): Outcome<PaymentRequest> {
	return decideWithReason(payMe, actor, number, 'denied', reason);
}

function decideWithReason(payMe: PayMe, actor: Actor, number: number, to: RequestState, reason: string): Outcome<PaymentRequest> {
	const trimmed = reason.trim();
	if (!trimmed) return fail({ code: 'reason-required' });
	return decide(payMe, actor, number, to, trimmed);
}

/** Checks that the actor may review the request now, for example before asking them for a reason. */
export function checkReviewer(payMe: PayMe, actor: Actor, number: number): Outcome<PaymentRequest> {
	const request = getPaymentRequest(payMe, number);
	if (!request) return fail({ code: 'request-not-found' });
	if (request.employeeUserId === actor.userId) return fail({ code: 'own-request' });
	if (!canReview(payMe, actor, request)) return fail({ code: 'not-a-reviewer' });
	if (request.state !== 'pending') return fail({ code: 'already-decided', number, state: request.state });
	return succeed([], request);
}

function canReview(payMe: PayMe, actor: Actor, request: PaymentRequest): boolean {
	if (isLeadership(payMe, actor)) return true;
	return request.eligibleJobIds.some((jobId) => getJob(payMe, jobId)?.managerRoleIds.some((roleId) => actor.roleIds.includes(roleId)));
}

function decide(payMe: PayMe, actor: Actor, number: number, to: RequestState, reason: string | null): Outcome<PaymentRequest> {
	const { storage } = payMe;
	return storage.transaction(() => {
		const checked = checkReviewer(payMe, actor, number);
		if (!checked.ok) return checked;

		const updated = updateRequestState(storage, number, { from: 'pending', to, actorUserId: actor.userId, reason });
		const request = getPaymentRequest(payMe, number)!;
		if (!updated) return fail({ code: 'already-decided', number, state: request.state });
		return succeed(
			[
				updateReviewCopies(payMe, request),
				updateEntryActions(request),
				logStateChange(payMe, request, to !== 'approved'),
				{ type: 'private-reply', content: `${stateName(to)} ${requestLabel(number)}.` }
			],
			request
		);
	});
}
