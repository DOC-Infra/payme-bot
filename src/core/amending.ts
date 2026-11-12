import { insertEvidence, startNextRound, updateRequestState } from '../storage/requests';
import type { Actor } from './actor';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { getTask } from './tasks';
import { checkLink, evidenceFor, getPaymentRequest, roundEffects, updateRequestEntry, type NewEvidence, type PaymentRequest } from './requests';

/** Checks that the actor may amend the request now, for example before showing them the amend form. */
export function checkAmend(payMe: PayMe, actor: Actor, number: number): Outcome<PaymentRequest> {
	const request = findOwnRequest(payMe, actor, number);
	if (!request.ok || request.value.state === 'rejected') return request;
	return fail({ code: 'cannot-amend', number, state: request.value.state });
}

export interface AmendForm {
	notesRequired: boolean;
}

/** The amend form for the actor's request, once checked that they may amend it now. */
export function amendForm(payMe: PayMe, actor: Actor, number: number): Outcome<AmendForm> {
	const checked = checkAmend(payMe, actor, number);
	if (!checked.ok) return checked;
	return succeed([], { notesRequired: amendNeedsNotes(payMe, checked.value) });
}

function amendNeedsNotes(payMe: PayMe, request: PaymentRequest): boolean {
	return getTask(payMe, request.taskId)?.notesRequired ?? true;
}

/** Checks that the actor may withdraw the request now, for example before asking them to confirm. */
export function checkWithdraw(payMe: PayMe, actor: Actor, number: number): Outcome<PaymentRequest> {
	const request = findOwnRequest(payMe, actor, number);
	if (!request.ok || ['pending', 'rejected'].includes(request.value.state)) return request;
	return fail({ code: 'cannot-withdraw', number, state: request.value.state });
}

function findOwnRequest(payMe: PayMe, actor: Actor, number: number): Outcome<PaymentRequest> {
	const request = getPaymentRequest(payMe, number);
	if (!request) return fail({ code: 'request-not-found' });
	if (request.employeeUserId !== actor.userId) return fail({ code: 'not-your-request' });
	return succeed([], request);
}

export function amendRequest(payMe: PayMe, actor: Actor, number: number, input: NewEvidence): Outcome<PaymentRequest> {
	const invalid = checkLink(input);
	if (invalid) return invalid;

	const { storage } = payMe;
	return storage.transaction(() => {
		const checked = checkAmend(payMe, actor, number);
		if (!checked.ok) return checked;

		const empty = checkAmendment(payMe, checked.value, input);
		if (empty) return empty;

		const { round } = checked.value;
		updateRequestState(storage, number, { from: 'rejected', to: 'pending', actorUserId: actor.userId, reason: null });
		startNextRound(storage, number);
		insertEvidence(storage, number, evidenceFor(input, round + 1));
		const request = getPaymentRequest(payMe, number)!;
		return succeed(
			[
				{ type: 'update-entry-actions', requestNumber: number, round, actions: [] },
				...roundEffects(payMe, request, `Amended and resubmitted by <@${actor.userId}>, Pending review.`)
			],
			request
		);
	});
}

function checkAmendment(payMe: PayMe, request: PaymentRequest, input: NewEvidence): Failure | null {
	const hasNotes = input.notes.trim() !== '';
	if (amendNeedsNotes(payMe, request) && !hasNotes) return fail({ code: 'notes-required' });
	if (!hasNotes && !input.link && input.files.length === 0) return fail({ code: 'amendment-empty' });
	return null;
}

export function withdrawRequest(payMe: PayMe, actor: Actor, number: number): Outcome<PaymentRequest> {
	const { storage } = payMe;
	return storage.transaction(() => {
		const checked = checkWithdraw(payMe, actor, number);
		if (!checked.ok) return checked;

		updateRequestState(storage, number, { from: checked.value.state, to: 'withdrawn', actorUserId: actor.userId, reason: null });
		const request = getPaymentRequest(payMe, number)!;
		return succeed([updateRequestEntry(payMe, request), { type: 'delete-review-copies', requestNumber: number }], request);
	});
}
