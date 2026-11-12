import type { Actor } from './actor';
import { changeState, checkChange } from './lifecycle';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { getTask } from './tasks';
import { checkLink, evidenceItems, roundEffects, updateEntryActions, updateRequestEntry, type NewEvidence, type PaymentRequest } from './requests';

export interface AmendForm {
	notesRequired: boolean;
}

/** The amend form for the actor's request, once checked that they may amend it now. */
export function amendForm(payMe: PayMe, actor: Actor, number: number): Outcome<AmendForm> {
	const checked = checkChange(payMe, actor, number, 'amend');
	if (!checked.ok) return checked;
	return succeed([], { notesRequired: amendNeedsNotes(payMe, checked.value) });
}

function amendNeedsNotes(payMe: PayMe, request: PaymentRequest): boolean {
	return getTask(payMe, request.taskId)?.notesRequired ?? true;
}

export function amendRequest(payMe: PayMe, actor: Actor, number: number, input: NewEvidence): Outcome<PaymentRequest> {
	const invalid = checkLink(input);
	if (invalid) return invalid;

	const checked = checkChange(payMe, actor, number, 'amend');
	if (!checked.ok) return checked;
	const empty = checkAmendment(payMe, checked.value, input);
	if (empty) return empty;

	const amended = changeState(payMe, actor, number, 'amend', null, evidenceItems(input));
	if (!amended.ok) return amended;
	const request = amended.value;
	return succeed(
		[
			updateEntryActions(request, request.round - 1),
			...roundEffects(payMe, request, `Amended and resubmitted by <@${actor.userId}>, Pending review.`)
		],
		request
	);
}

function checkAmendment(payMe: PayMe, request: PaymentRequest, input: NewEvidence): Failure | null {
	const hasNotes = input.notes.trim() !== '';
	if (amendNeedsNotes(payMe, request) && !hasNotes) return fail({ code: 'notes-required' });
	if (!hasNotes && !input.link && input.files.length === 0) return fail({ code: 'amendment-empty' });
	return null;
}

export function withdrawRequest(payMe: PayMe, actor: Actor, number: number): Outcome<PaymentRequest> {
	const withdrawn = changeState(payMe, actor, number, 'withdraw');
	if (!withdrawn.ok) return withdrawn;

	const request = withdrawn.value;
	return succeed([updateRequestEntry(payMe, request), { type: 'delete-review-copies', requestNumber: number }], request);
}
