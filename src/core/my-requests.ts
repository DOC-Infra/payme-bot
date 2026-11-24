import type { Actor } from './actor';
import { notice, type Card } from './effects';
import { getEmployee } from './employees';
import { fail, succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { owedTo, totalOwed } from './payouts';
import { formatAmount } from './rates';
import { shareLabel, stateName } from './labels';
import { requestTitle, type PaymentRequest } from './requests';
import { getTask } from './tasks';

export interface MyRequests {
	requests: PaymentRequest[];
	estimatedOwed: number;
}

export function myRequests(payMe: PayMe, actor: Actor): Outcome<MyRequests> {
	if (!getEmployee(payMe, actor.userId)) return fail({ code: 'not-hired' });

	const requests = payMe.requests.loadMany({ employeeUserId: actor.userId, states: ['pending', 'rejected', 'approved'] });
	const owed = owedTo(payMe, actor.userId);
	const estimatedOwed = totalOwed(owed);
	if (requests.length === 0 && estimatedOwed === 0)
		return succeed([{ type: 'private-reply', card: notice('You have no open Payment Requests.', 'neutral') }], { requests, estimatedOwed });

	const lines = requests.length
		? requests.map((request) => `${requestTitle(request.number, getTask(payMe, request.taskId)!)}: ${stateName(request.state)}`)
		: ['You have no open Payment Requests.'];
	if (owed.unpaidShareIds.length) lines.push(`Shares ${owed.unpaidShareIds.map(shareLabel).join(', ')}: ${formatAmount(owed.sharesTotal)} owed`);
	const card: Card = {
		tone: 'info',
		title: 'Your open requests',
		description: lines.join('\n'),
		fields: [{ name: 'Estimated amount owed', value: `**${formatAmount(estimatedOwed)}**` }],
		footer: 'An estimate at current Rates. The Rate when your Payout is generated applies.'
	};
	return succeed([{ type: 'private-reply', card }], { requests, estimatedOwed });
}
