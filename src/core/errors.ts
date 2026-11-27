import { formatAmount, formatPercent } from './rates';
import { maxFormOptions } from './tasks';
import {
	disbursementLabel,
	disbursementStateName,
	payoutLabel,
	payoutStateName,
	requestLabel,
	shareLabel,
	stateName,
	type DisbursementState,
	type PayoutState,
	type RequestState
} from './labels';

export type PayMeError =
	| { code: 'not-permitted' }
	| { code: 'review-channel-unavailable'; name: string }
	| { code: 'job-not-found' }
	| { code: 'job-name-taken'; name: string }
	| { code: 'job-retired'; name: string }
	| { code: 'invalid-rate'; rate: string }
	| { code: 'task-not-found' }
	| { code: 'task-name-taken'; name: string; retired: boolean }
	| { code: 'task-not-retired'; name: string }
	| { code: 'task-has-no-active-job'; name: string }
	| { code: 'task-needs-a-job' }
	| { code: 'too-many-tasks'; job: string }
	| { code: 'already-employee' }
	| { code: 'invalid-minecraft-name'; name: string }
	| { code: 'employee-channel-taken'; channelId: string }
	| { code: 'not-hired' }
	| { code: 'no-jobs' }
	| { code: 'no-tasks' }
	| { code: 'task-not-offered' }
	| { code: 'job-not-held' }
	| { code: 'notes-required' }
	| { code: 'amendment-empty' }
	| { code: 'invalid-ticket'; ticket: string }
	| { code: 'no-ticket-task'; name: string }
	| { code: 'ticket-claimed'; ticket: string }
	| { code: 'invalid-link'; link: string }
	| { code: 'evidence-required' }
	| { code: 'no-requests-thread' }
	| { code: 'already-decided'; number: number; state: RequestState }
	| { code: 'request-not-found' }
	| { code: 'own-request' }
	| { code: 'not-a-reviewer' }
	| { code: 'reason-required' }
	| { code: 'payout-not-found' }
	| { code: 'nothing-owed' }
	| { code: 'link-needs-a-member' }
	| { code: 'employee-channel-unusable'; channelId: string; missing: string[] }
	| { code: 'job-required'; task: string }
	| { code: 'employee-not-found' }
	| { code: 'employee-no-requests-thread' }
	| { code: 'not-their-manager' }
	| { code: 'payout-not-open'; number: number; state: PayoutState }
	| { code: 'payout-updated'; number: number }
	| { code: 'not-your-request' }
	| { code: 'cannot-amend'; number: number; state: RequestState }
	| { code: 'cannot-withdraw'; number: number; state: RequestState }
	| { code: 'cannot-pay'; number: number; state: RequestState }
	| { code: 'invalid-amount'; amount: string }
	| { code: 'invalid-month'; month: string }
	| { code: 'spending-category-not-found' }
	| { code: 'spending-category-unavailable'; name: string }
	| { code: 'disbursement-not-allowed'; category: string }
	| { code: 'disbursement-job-required'; category: string }
	| { code: 'own-disbursement' }
	| { code: 'disbursement-not-found' }
	| { code: 'not-your-disbursement' }
	| { code: 'disbursement-decided'; number: number; state: DisbursementState }
	| { code: 'cannot-withdraw-disbursement'; number: number; state: DisbursementState }
	| { code: 'invalid-percent'; percent: string }
	| { code: 'targets-over-100'; total: number }
	| { code: 'spending-category-name-required' }
	| { code: 'spending-category-name-taken'; name: string; retired: boolean }
	| { code: 'spending-category-built-in'; name: string }
	| { code: 'spending-category-not-retired'; name: string }
	| { code: 'invalid-month-range'; from: string; to: string }
	| { code: 'report-too-long'; months: number; max: number }
	| { code: 'project-not-found' }
	| { code: 'project-name-taken'; name: string }
	| { code: 'project-closed'; name: string }
	| { code: 'not-project-manager'; job: string }
	| { code: 'share-job-not-held'; job: string }
	| { code: 'over-budget'; name: string; balance: number }
	| { code: 'share-not-found' }
	| { code: 'share-edit-empty' }
	| { code: 'share-paid'; id: number }
	| { code: 'share-in-payout'; id: number; payoutNumber: number };

export function describeError(error: PayMeError): string {
	switch (error.code) {
		case 'not-permitted':
			return 'Only Leadership can do that.';
		case 'review-channel-unavailable':
			return `PayMe couldn't create or set up #${error.name} in the Payment Review category. Give it the Manage Channels and Manage Roles permissions, then try again.`;
		case 'job-not-found':
			return 'That Job does not exist.';
		case 'job-name-taken':
			return `A Job named ${error.name} already exists.`;
		case 'job-retired':
			return `The ${error.name} Job is retired.`;
		case 'task-not-found':
			return 'That Task does not exist.';
		case 'task-name-taken':
			return error.retired
				? `A Retired Task named ${error.name} already exists. Restore it from the Tasks button on the Leadership dashboard.`
				: `A Task named ${error.name} already exists.`;
		case 'task-not-retired':
			return `The ${error.name} Task is not retired.`;
		case 'task-has-no-active-job':
			return `The ${error.name} Task doesn't belong to any active Job. Give it an active Job with its Jobs button first.`;
		case 'task-needs-a-job':
			return 'A Task must belong to at least one Job.';
		case 'too-many-tasks':
			return `The ${error.job} Job already has ${maxFormOptions} active Tasks, the most a request form can list. Retire one first.`;
		case 'invalid-rate':
			return `${error.rate} is not a valid Rate. Use a plain number above zero with at most two decimal places and no currency symbol, like 1500 or 12.5.`;
		case 'already-employee':
			return 'That member is already an Employee. Use /link to change their Minecraft Name or channel.';
		case 'invalid-minecraft-name':
			return `${error.name} is not a valid Minecraft Name. Use 3 to 16 letters, digits or underscores.`;
		case 'employee-channel-taken':
			return `<#${error.channelId}> is already another Employee's channel.`;
		case 'not-hired':
			return "You haven't been hired yet. Ask Leadership to hire you.";
		case 'no-jobs':
			return "You don't hold any Jobs, so there is nothing to request pay for.";
		case 'no-tasks':
			return 'There are no active Tasks to request pay for in those Jobs. Ask Leadership to add some.';
		case 'task-not-offered':
			return 'That Task is not an active Task in any Job you can request pay under.';
		case 'job-not-held':
			return "You don't hold that Job, or it is retired.";
		case 'notes-required':
			return 'Add some notes about the work.';
		case 'amendment-empty':
			return 'Add notes, a link or a file to show what you changed.';
		case 'invalid-ticket':
			return `${error.ticket} is not a ticket number. Enter exactly 5 digits.`;
		case 'no-ticket-task':
			return `There is no ${error.name} Task yet. Ask Leadership to add it.`;
		case 'ticket-claimed':
			return `You have already claimed ticket ${error.ticket}.`;
		case 'invalid-link':
			return `${error.link} is not a web link. Use one starting with https://.`;
		case 'evidence-required':
			return 'Add a link or at least one file as Evidence.';
		case 'no-requests-thread':
			return 'Your Requests Thread is not set up yet. Ask Leadership to /link you to your Employee Channel.';
		case 'already-decided':
			return `${requestLabel(error.number)} was already decided: it is ${stateName(error.state)}.`;
		case 'request-not-found':
			return 'That Payment Request does not exist.';
		case 'own-request':
			return 'You cannot review your own Payment Request.';
		case 'not-a-reviewer':
			return 'Only Managers of the Jobs this request was submitted for, or Leadership, can review it.';
		case 'reason-required':
			return 'Give a reason so the Employee knows why.';
		case 'payout-not-found':
			return 'That Payout does not exist.';
		case 'job-required':
			return `${error.task} is in more than one Job. Pick the Job the work was for.`;
		case 'employee-channel-unusable':
			return `PayMe can't take over <#${error.channelId}> yet. In that channel's permissions, give PayMe's role: ${error.missing.join(', ')}. Then link again.`;
		case 'link-needs-a-member':
			return 'Right-click a message the Employee sent in their own channel. That one was sent by a bot or webhook.';
		case 'nothing-owed':
			return 'This Employee has no Approved requests or Shares waiting to be paid.';
		case 'employee-not-found':
			return 'That member is not an Employee.';
		case 'employee-no-requests-thread':
			return "That Employee's Requests Thread is not set up yet. Ask Leadership to /link them to their Employee Channel.";
		case 'not-their-manager':
			return 'You can only request payment for an Employee under a Job they hold and you manage.';
		case 'payout-not-open':
			return `${payoutLabel(error.number)} is no longer Open: it is ${payoutStateName(error.state)}.`;
		case 'payout-updated': {
			const label = payoutLabel(error.number);
			return `${label} has been updated since this was shown, so its total and Pay Command may have changed. Nothing was changed. Open the latest ${label} from Generate Payouts or /payouts.`;
		}
		case 'not-your-request':
			return 'Only the Employee who submitted this Payment Request can do that.';
		case 'cannot-amend':
			return `${requestLabel(error.number)} is ${stateName(error.state)}. Only Rejected requests can be amended.`;
		case 'cannot-withdraw':
			return `${requestLabel(error.number)} is ${stateName(error.state)}. Only Pending or Rejected requests can be withdrawn.`;
		case 'cannot-pay':
			return `${requestLabel(error.number)} is ${stateName(error.state)}. Only Approved requests can be paid.`;
		case 'invalid-amount':
			return `${error.amount} is not a valid amount. Use a plain number above zero with at most two decimal places and no currency symbol, like 1500 or 12.5.`;
		case 'invalid-month':
			return `${error.month} is not a valid month. Use the year and month, like 2026-11, from 2000 to 2999.`;
		case 'invalid-month-range':
			return `${error.to} is before ${error.from}. Give the earlier month first.`;
		case 'report-too-long':
			return `That is ${error.months} months. A report can cover at most ${error.max}.`;
		case 'invalid-percent':
			return `${error.percent} is not a valid target. Use a percentage above 0 and at most 100, with no % sign, like 25 or 12.5.`;
		case 'targets-over-100':
			return `That would make the targets add up to ${formatPercent(error.total)} of the Appropriation. Lower another target first.`;
		case 'spending-category-unavailable':
			return `Disbursements can't be requested from ${error.name}.`;
		case 'disbursement-not-allowed':
			return `Only Employees and Managers of the Jobs that draw on ${error.category}, or Leadership, can request from it.`;
		case 'disbursement-job-required':
			return `More than one of your Jobs draws on ${error.category}. Pick the Job this is for.`;
		case 'own-disbursement':
			return "You can't request a Disbursement to yourself. Ask Leadership.";
		case 'disbursement-not-found':
			return 'That Disbursement does not exist.';
		case 'disbursement-decided':
			return `${disbursementLabel(error.number)} is ${disbursementStateName(error.state)}, so it can't be paid or declined.`;
		case 'not-your-disbursement':
			return 'Only whoever requested it, or Leadership, can withdraw it.';
		case 'cannot-withdraw-disbursement':
			return `${disbursementLabel(error.number)} is ${disbursementStateName(error.state)}. Only Requested Disbursements can be withdrawn.`;
		case 'spending-category-not-found':
			return 'That Spending Category does not exist.';
		case 'spending-category-name-required':
			return 'Give the Spending Category a name.';
		case 'spending-category-name-taken':
			return error.retired
				? `A Retired Spending Category named ${error.name} already exists. Restore it from Spending Categories on the Leadership dashboard.`
				: `A Spending Category named ${error.name} already exists.`;
		case 'spending-category-built-in':
			return `${error.name} is built in: every Payout and Share counts toward it, so it can't be renamed, given Jobs or Retired.`;
		case 'spending-category-not-retired':
			return `The ${error.name} Spending Category is not retired.`;
		case 'project-not-found':
			return 'That Project does not exist.';
		case 'project-name-taken':
			return `A Project named ${error.name} already exists.`;
		case 'project-closed':
			return `The ${error.name} Project is closed.`;
		case 'not-project-manager':
			return `Only Managers of the ${error.job} Job, or Leadership, can do that.`;
		case 'share-job-not-held':
			return `That Employee doesn't hold the ${error.job} Job, or manage it, so they can't get a Share of its Projects.`;
		case 'over-budget':
			return `The ${error.name} Project only has ${formatAmount(error.balance)} left to give.`;
		case 'share-not-found':
			return 'That Share does not exist.';
		case 'share-edit-empty':
			return 'Give a new amount or note.';
		case 'share-paid':
			return `${shareLabel(error.id)} has already been paid, so it can't be changed.`;
		case 'share-in-payout':
			return `${shareLabel(error.id)} is in ${payoutLabel(error.payoutNumber)}, which is Open. Ask Leadership to discard that Payout first.`;
	}
}
