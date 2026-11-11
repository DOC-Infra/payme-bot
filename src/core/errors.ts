import { payoutLabel, payoutStateName, type PayoutState } from './payouts';
import { requestLabel, stateName, type RequestState } from './requests';

export type PayMeError =
	| { code: 'not-permitted' }
	| { code: 'job-not-found' }
	| { code: 'job-name-taken'; name: string }
	| { code: 'job-retired'; name: string }
	| { code: 'invalid-rate'; rate: string }
	| { code: 'task-not-found' }
	| { code: 'task-name-taken'; name: string }
	| { code: 'task-needs-a-job' }
	| { code: 'too-many-tasks'; job: string }
	| { code: 'already-employee' }
	| { code: 'invalid-minecraft-name'; name: string }
	| { code: 'employee-channel-taken'; channelId: string }
	| { code: 'not-hired' }
	| { code: 'no-jobs' }
	| { code: 'no-tasks' }
	| { code: 'task-not-offered' }
	| { code: 'notes-required' }
	| { code: 'invalid-link'; link: string }
	| { code: 'evidence-required' }
	| { code: 'no-requests-thread' }
	| { code: 'already-decided'; number: number; state: RequestState }
	| { code: 'request-not-found' }
	| { code: 'own-request' }
	| { code: 'not-a-reviewer' }
	| { code: 'reason-required' }
	| { code: 'payout-not-found' }
	| { code: 'payout-already-open'; number: number }
	| { code: 'nothing-owed' }
	| { code: 'employee-not-found' }
	| { code: 'payout-not-open'; number: number; state: PayoutState };

export function describeError(error: PayMeError): string {
	switch (error.code) {
		case 'not-permitted':
			return 'Only Leadership can do that.';
		case 'job-not-found':
			return 'That Job does not exist.';
		case 'job-name-taken':
			return `A Job named ${error.name} already exists.`;
		case 'job-retired':
			return `The ${error.name} Job is retired.`;
		case 'task-not-found':
			return 'That Task does not exist.';
		case 'task-name-taken':
			return `A Task named ${error.name} already exists.`;
		case 'task-needs-a-job':
			return 'A Task must belong to at least one Job.';
		case 'too-many-tasks':
			return `The ${error.job} Job already has 25 active Tasks, the most a request form can list. Retire one first.`;
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
			return 'Your Jobs have no active Tasks to request pay for. Ask Leadership to add some.';
		case 'task-not-offered':
			return 'That Task is not an active Task in any of your Jobs.';
		case 'notes-required':
			return 'Add some notes about the work.';
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
		case 'payout-already-open':
			return `This Employee already has an Open Payout, ${payoutLabel(error.number)}. Mark it paid or discard it first.`;
		case 'nothing-owed':
			return 'This Employee has no Approved requests waiting to be paid.';
		case 'employee-not-found':
			return 'That member is not an Employee.';
		case 'payout-not-open':
			return `${payoutLabel(error.number)} is no longer Open: it is ${payoutStateName(error.state)}.`;
	}
}
