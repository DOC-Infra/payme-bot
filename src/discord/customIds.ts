import type { EntryAction } from '../core';

export type ReviewAction = 'approve' | 'reject' | 'deny';
export type ReasonAction = Exclude<ReviewAction, 'approve'>;
export type EntryButton = EntryAction | 'confirm-withdraw';
export type PayoutButton = { action: 'generate'; employeeUserId: string } | { action: 'show' | 'paid' | 'discard'; payoutNumber: number };

export type CustomId =
	| { kind: 'request-button' }
	| { kind: 'claim-ticket-button' }
	| { kind: 'claim-ticket-modal' }
	| { kind: 'request-job-select'; employeeUserId: string | null }
	| { kind: 'request-modal'; employeeUserId: string | null }
	| { kind: 'hire-modal'; hireeUserId: string }
	| { kind: 'entry-button'; action: EntryButton; requestNumber: number }
	| { kind: 'amend-modal'; requestNumber: number }
	| { kind: 'review-button'; action: ReviewAction; requestNumber: number }
	| { kind: 'reason-modal'; action: ReasonAction; requestNumber: number }
	| ({ kind: 'payout-button' } & PayoutButton);

const entryButtons = ['amend', 'withdraw', 'confirm-withdraw'] as const;
const reviewActions = ['approve', 'reject', 'deny'] as const;
const reasonActions = ['reject', 'deny'] as const;
const payoutActions = ['show', 'paid', 'discard'] as const;

export function encodeCustomId(id: CustomId): string {
	switch (id.kind) {
		case 'request-button':
			return 'request-payment';
		case 'claim-ticket-button':
			return 'claim-ticket';
		case 'claim-ticket-modal':
			return 'claim-ticket-modal';
		case 'request-job-select':
			return join('request-job', id.employeeUserId);
		case 'request-modal':
			return join('request', id.employeeUserId);
		case 'hire-modal':
			return join('hire', id.hireeUserId);
		case 'entry-button':
			return join('entry', id.action, id.requestNumber);
		case 'amend-modal':
			return join('amend', id.requestNumber);
		case 'review-button':
			return join('review', id.action, id.requestNumber);
		case 'reason-modal':
			return join('review-reason', id.action, id.requestNumber);
		case 'payout-button':
			return join('payout', id.action, id.action === 'generate' ? id.employeeUserId : id.payoutNumber);
	}
}

export function decodeCustomId(customId: string): CustomId | null {
	const [prefix, ...parts] = customId.split(':');
	return decoders.get(prefix)?.(parts) ?? null;
}

const decoders = new Map<string, (parts: string[]) => CustomId | null>([
	['request-payment', (parts) => (parts.length ? null : { kind: 'request-button' })],
	['claim-ticket', (parts) => (parts.length ? null : { kind: 'claim-ticket-button' })],
	['claim-ticket-modal', (parts) => (parts.length ? null : { kind: 'claim-ticket-modal' })],
	['request-job', (parts) => optionalUser(parts, (employeeUserId) => ({ kind: 'request-job-select', employeeUserId }))],
	['request', (parts) => optionalUser(parts, (employeeUserId) => ({ kind: 'request-modal', employeeUserId }))],
	['hire', ([userId, ...rest]) => (isDigits(userId) && !rest.length ? { kind: 'hire-modal', hireeUserId: userId } : null)],
	['entry', (parts) => withAction(parts, entryButtons, (action, requestNumber) => ({ kind: 'entry-button', action, requestNumber }))],
	['amend', ([number, ...rest]) => (isDigits(number) && !rest.length ? { kind: 'amend-modal', requestNumber: Number(number) } : null)],
	['review', (parts) => withAction(parts, reviewActions, (action, requestNumber) => ({ kind: 'review-button', action, requestNumber }))],
	['review-reason', (parts) => withAction(parts, reasonActions, (action, requestNumber) => ({ kind: 'reason-modal', action, requestNumber }))],
	['payout', decodePayout]
]);

function decodePayout(parts: string[]): CustomId | null {
	if (parts[0] === 'generate') {
		const [, userId, ...rest] = parts;
		return isDigits(userId) && !rest.length ? { kind: 'payout-button', action: 'generate', employeeUserId: userId } : null;
	}
	return withAction(parts, payoutActions, (action, payoutNumber) => ({ kind: 'payout-button', action, payoutNumber }));
}

function optionalUser(parts: string[], build: (userId: string | null) => CustomId): CustomId | null {
	const [userId, ...rest] = parts;
	if (userId === undefined) return build(null);
	return isDigits(userId) && !rest.length ? build(userId) : null;
}

function withAction<A extends string>(parts: string[], actions: readonly A[], build: (action: A, number: number) => CustomId): CustomId | null {
	const [action, number, ...rest] = parts;
	const known = actions.find((candidate) => candidate === action);
	return known && isDigits(number) && !rest.length ? build(known, Number(number)) : null;
}

function isDigits(part: string | undefined): part is string {
	return /^\d+$/.test(part ?? '');
}

function join(...parts: (string | number | null)[]): string {
	return parts.filter((part) => part !== null).join(':');
}
