import { selectRequest, selectRequestNumbers } from '../storage/requests';
import type { Actor } from './actor';
import { notice, type Card } from './effects';
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
		return succeed([{ type: 'private-reply', card: notice('You have no open Payment Requests.', 'neutral') }], { requests, estimatedOwed });

	const lines = requests.map((request) => `${requestTitle(request.number, getTask(payMe, request.taskId)!)}: ${stateName(request.state)}`);
	const card: Card = {
		tone: 'info',
		title: 'Your open requests',
		description: lines.join('\n'),
		fields: [{ name: 'Estimated amount owed', value: `**${formatAmount(estimatedOwed)}**` }],
		footer: 'An estimate at current Rates. The Rate when your Payout is generated applies.'
	};
	return succeed([{ type: 'private-reply', card }], { requests, estimatedOwed });
}
