import { selectRequest, selectRequestNumbers } from '../storage/requests';
import type { Actor } from './actor';
import { getEmployee } from './employees';
import { estimateOwed } from './estimates';
import { fail, succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { formatAmount } from './rates';
import { requestTitle, stateName, type PaymentRequest } from './requests';
import { getTask } from './tasks';

export interface MyRequests {
	requests: PaymentRequest[];
	estimatedOwed: number;
}

/** The actor's Pending, Rejected and Approved requests, and their Approved requests valued at current Rates. */
export function myRequests(payMe: PayMe, actor: Actor): Outcome<MyRequests> {
	if (!getEmployee(payMe, actor.userId)) return fail({ code: 'not-hired' });

	const { storage } = payMe;
	const requests = selectRequestNumbers(storage, actor.userId, ['pending', 'rejected', 'approved']).map((number) =>
		selectRequest(storage, number)!
	);
	const estimatedOwed = estimateOwed(payMe, actor.userId);
	if (requests.length === 0)
		return succeed([{ type: 'private-reply', content: 'You have no open Payment Requests.' }], { requests, estimatedOwed });

	const lines = requests.map((request) => `${requestTitle(request.number, getTask(payMe, request.taskId)!)}: ${stateName(request.state)}`);
	const estimate = `Estimated amount owed: **${formatAmount(estimatedOwed)}** (an estimate at current Rates; the Rate when your Payout is generated applies)`;
	return succeed([{ type: 'private-reply', content: [...lines, '', estimate].join('\n') }], { requests, estimatedOwed });
}
