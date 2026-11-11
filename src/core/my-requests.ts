import { selectRequest, selectRequestNumbers } from '../storage/requests';
import type { Actor } from './actor';
import { getEmployee } from './employees';
import { fail, succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { owedTo, totalOwed } from './payouts';
import { formatAmount } from './rates';
import { stateName } from './labels';
import { requestTitle, type PaymentRequest } from './requests';
import { getTask } from './tasks';

export interface MyRequests {
	requests: PaymentRequest[];
	estimatedOwed: number;
}

export function myRequests(payMe: PayMe, actor: Actor): Outcome<MyRequests> {
	if (!getEmployee(payMe, actor.userId)) return fail({ code: 'not-hired' });

	const { storage } = payMe;
	const requests = selectRequestNumbers(storage, actor.userId, ['pending', 'rejected', 'approved']).map((number) =>
		selectRequest(storage, number)!
	);
	const estimatedOwed = totalOwed(owedTo(payMe, actor.userId));
	if (requests.length === 0)
		return succeed([{ type: 'private-reply', content: 'You have no open Payment Requests.' }], { requests, estimatedOwed });

	const lines = requests.map((request) => `${requestTitle(request.number, getTask(payMe, request.taskId)!)}: ${stateName(request.state)}`);
	const estimate = `Estimated amount owed: **${formatAmount(estimatedOwed)}** (an estimate at current Rates; the Rate when your Payout is generated applies)`;
	return succeed([{ type: 'private-reply', content: [...lines, '', estimate].join('\n') }], { requests, estimatedOwed });
}
