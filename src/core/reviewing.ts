import type { Actor } from './actor';
import { changeState, type RequestChange } from './lifecycle';
import { succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { logStateChange, updateEntryActions, updateReviewCopies, type PaymentRequest } from './requests';

export function approveRequest(payMe: PayMe, actor: Actor, number: number): Outcome<PaymentRequest> {
	return decide(payMe, actor, number, 'approve', null);
}

export function rejectRequest(payMe: PayMe, actor: Actor, number: number, reason: string): Outcome<PaymentRequest> {
	return decide(payMe, actor, number, 'reject', reason);
}

export function denyRequest(payMe: PayMe, actor: Actor, number: number, reason: string): Outcome<PaymentRequest> {
	return decide(payMe, actor, number, 'deny', reason);
}

function decide(payMe: PayMe, actor: Actor, number: number, change: RequestChange, reason: string | null): Outcome<PaymentRequest> {
	const decided = changeState(payMe, actor, number, change, reason);
	if (!decided.ok) return decided;

	const request = decided.value;
	return succeed([updateReviewCopies(payMe, request), updateEntryActions(request), logStateChange(payMe, request, change !== 'approve')], request);
}
