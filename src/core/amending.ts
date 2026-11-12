import { insertEvidence, startNextRound } from '../storage/requests';
import type { Actor } from './actor';
import { changeState, checkChange } from './lifecycle';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { getTask } from './tasks';
import {
	checkLink,
	evidenceFor,
	getPaymentRequest,
	roundEffects,
	updateEntryActions,
	updateRequestEntry,
	type NewEvidence,
	type PaymentRequest
} from './requests';

export function amendRequest(payMe: PayMe, actor: Actor, number: number, input: NewEvidence): Outcome<PaymentRequest> {
	const invalid = checkLink(input);
	if (invalid) return invalid;

	const { storage } = payMe;
	return storage.transaction(() => {
		const checked = checkChange(payMe, actor, number, 'amend');
		if (!checked.ok) return checked;
		const empty = checkAmendment(payMe, checked.value, input);
		if (empty) return empty;

		const amended = changeState(payMe, actor, number, 'amend');
		if (!amended.ok) return amended;
		const { round } = amended.value;
		startNextRound(storage, number);
		insertEvidence(storage, number, evidenceFor(input, round + 1));
		const request = getPaymentRequest(payMe, number)!;
		return succeed(
			[updateEntryActions(request, round), ...roundEffects(payMe, request, `Amended and resubmitted by <@${actor.userId}>, Pending review.`)],
			request
		);
	});
}

function checkAmendment(payMe: PayMe, request: PaymentRequest, input: NewEvidence): Failure | null {
	const hasNotes = input.notes.trim() !== '';
	if (getTask(payMe, request.taskId)?.notesRequired && !hasNotes) return fail({ code: 'notes-required' });
	if (!hasNotes && !input.link && input.files.length === 0) return fail({ code: 'amendment-empty' });
	return null;
}

export function withdrawRequest(payMe: PayMe, actor: Actor, number: number): Outcome<PaymentRequest> {
	return payMe.storage.transaction(() => {
		const withdrawn = changeState(payMe, actor, number, 'withdraw');
		if (!withdrawn.ok) return withdrawn;

		const request = withdrawn.value;
		return succeed([updateRequestEntry(payMe, request), { type: 'delete-review-copies', requestNumber: number }], request);
	});
}
