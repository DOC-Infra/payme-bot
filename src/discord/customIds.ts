import { parseMonth, type EntryAction } from '../core';

export type ReviewAction = 'approve' | 'reject' | 'deny';
export type ReasonAction = Exclude<ReviewAction, 'approve'>;
export type EntryButton = EntryAction | 'confirm-withdraw';
export type PayoutButton =
	| { action: 'generate'; employeeUserId: string }
	| { action: 'show'; payoutNumber: number }
	| { action: 'paid' | 'discard'; payoutNumber: number; revision: number };
export type ProjectButton = { action: 'create' } | { action: (typeof projectButtons)[number]; projectId: number };
export type DashboardButton = (typeof dashboardButtons)[number];
export type ManageButtonAction = (typeof manageButtons)[number];
export type ManageMenuAction = (typeof manageMenus)[number];
export type ManageModalAction = (typeof manageModals)[number];
export type ProjectModal = { action: 'create' } | { action: 'share' | 'fund'; projectId: number } | { action: 'edit-share'; shareId: number };

export type CustomId =
	| { kind: 'request-button' }
	| { kind: 'claim-ticket-button' }
	| { kind: 'claim-ticket-modal'; home: string | null }
	| { kind: 'ticket-home-pick' }
	| { kind: 'request-job-select'; home: string; employeeUserId: string | null }
	| { kind: 'request-modal'; home: string; employeeUserId: string | null }
	| { kind: 'home-pick'; employeeUserId: string | null }
	| { kind: 'home-set' }
	| { kind: 'hire-modal'; hireeUserId: string }
	| { kind: 'link-modal'; userId: string; channelId: string }
	| { kind: 'entry-button'; action: EntryButton; requestNumber: number }
	| { kind: 'amend-modal'; requestNumber: number }
	| { kind: 'review-button'; action: ReviewAction; requestNumber: number }
	| { kind: 'reason-modal'; action: ReasonAction; requestNumber: number }
	| ({ kind: 'payout-button' } & PayoutButton)
	| ({ kind: 'project-button' } & ProjectButton)
	| ({ kind: 'project-modal' } & ProjectModal)
	| { kind: 'project-select' }
	| { kind: 'share-select'; projectId: number }
	| { kind: 'dashboard-button'; action: DashboardButton }
	| { kind: 'dashboard-request-for' }
	| { kind: 'settings-modal' }
	| { kind: 'manage-button'; action: ManageButtonAction; id: number | null }
	| { kind: 'manage-menu'; action: ManageMenuAction }
	| { kind: 'manage-modal'; action: ManageModalAction; id: number | null }
	| { kind: 'appropriation-report-button'; month: string }
	| { kind: 'appropriation-report-modal' };

const entryButtons = ['amend', 'withdraw', 'confirm-withdraw'] as const;
const reviewActions = ['approve', 'reject', 'deny'] as const;
const reasonActions = ['reject', 'deny'] as const;
const settleActions = ['paid', 'discard'] as const;
const projectButtons = ['share', 'change-share', 'fund', 'close', 'confirm-close'] as const;
const projectModals = ['share', 'fund'] as const;
const dashboardButtons = ['payouts', 'projects', 'jobs', 'tasks', 'spending-categories', 'settings'] as const;
const manageButtons = [
	'new-job',
	'edit-job',
	'job-managers',
	'retire-job',
	'confirm-retire-job',
	'new-task',
	'edit-task',
	'task-jobs',
	'retire-task',
	'restore-task',
	'new-spending-category',
	'edit-spending-category',
	'retire-spending-category',
	'restore-spending-category'
] as const;
const manageMenus = ['open-job', 'open-job-tasks', 'open-task', 'open-spending-category'] as const;
const manageModals = [
	'new-job',
	'edit-job',
	'job-managers',
	'new-task',
	'edit-task',
	'task-jobs',
	'new-spending-category',
	'edit-spending-category'
] as const;

export function encodeCustomId(id: CustomId): string {
	switch (id.kind) {
		case 'request-button':
			return 'request-payment';
		case 'claim-ticket-button':
			return 'claim-ticket';
		case 'claim-ticket-modal':
			return join('claim-ticket-modal', id.home);
		case 'ticket-home-pick':
			return 'ticket-home-pick';
		case 'request-job-select':
			return join('request-job', id.home, id.employeeUserId);
		case 'request-modal':
			return join('request', id.home, id.employeeUserId);
		case 'home-pick':
			return join('home-pick', id.employeeUserId);
		case 'home-set':
			return 'home-set';
		case 'link-modal':
			return join('link', id.userId, id.channelId);
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
			if (id.action === 'generate') return join('payout', id.action, id.employeeUserId);
			if (id.action === 'show') return join('payout', id.action, id.payoutNumber);
			return join('payout', id.action, id.payoutNumber, id.revision);
		case 'project-button':
			return join('project', id.action, id.action === 'create' ? null : id.projectId);
		case 'project-modal':
			if (id.action === 'create') return 'project-form:create';
			return join('project-form', id.action, id.action === 'edit-share' ? id.shareId : id.projectId);
		case 'project-select':
			return 'project-pick';
		case 'share-select':
			return join('share-pick', id.projectId);
		case 'dashboard-button':
			return join('dashboard', id.action);
		case 'dashboard-request-for':
			return 'dashboard-request-for';
		case 'settings-modal':
			return 'settings';
		case 'manage-button':
			return join('manage', id.action, id.id);
		case 'manage-menu':
			return join('manage-pick', id.action);
		case 'manage-modal':
			return join('manage-form', id.action, id.id);
		case 'appropriation-report-button':
			return join('appropriation-report', id.month);
		case 'appropriation-report-modal':
			return 'appropriation-report-form';
	}
}

export function decodeCustomId(customId: string): CustomId | null {
	const [prefix, ...parts] = customId.split(':');
	return decoders.get(prefix)?.(parts) ?? null;
}

const decoders = new Map<string, (parts: string[]) => CustomId | null>([
	['request-payment', (parts) => (parts.length ? null : { kind: 'request-button' })],
	['claim-ticket', (parts) => (parts.length ? null : { kind: 'claim-ticket-button' })],
	['claim-ticket-modal', (parts) => optionalUser(parts, (home) => ({ kind: 'claim-ticket-modal', home }))],
	['ticket-home-pick', (parts) => (parts.length ? null : { kind: 'ticket-home-pick' })],
	['request-job', ([home, ...rest]) => inHome(home, rest, (employeeUserId) => ({ kind: 'request-job-select', home, employeeUserId }))],
	['request', ([home, ...rest]) => inHome(home, rest, (employeeUserId) => ({ kind: 'request-modal', home, employeeUserId }))],
	['home-pick', (parts) => optionalUser(parts, (employeeUserId) => ({ kind: 'home-pick', employeeUserId }))],
	['home-set', (parts) => (parts.length ? null : { kind: 'home-set' })],
	[
		'link',
		([userId, channelId, ...rest]) => (isDigits(userId) && isDigits(channelId) && !rest.length ? { kind: 'link-modal', userId, channelId } : null)
	],
	['hire', ([userId, ...rest]) => (isDigits(userId) && !rest.length ? { kind: 'hire-modal', hireeUserId: userId } : null)],
	['entry', (parts) => withAction(parts, entryButtons, (action, requestNumber) => ({ kind: 'entry-button', action, requestNumber }))],
	['amend', ([number, ...rest]) => (isDigits(number) && !rest.length ? { kind: 'amend-modal', requestNumber: Number(number) } : null)],
	['review', (parts) => withAction(parts, reviewActions, (action, requestNumber) => ({ kind: 'review-button', action, requestNumber }))],
	['review-reason', (parts) => withAction(parts, reasonActions, (action, requestNumber) => ({ kind: 'reason-modal', action, requestNumber }))],
	['payout', decodePayout],
	['project', decodeProjectButton],
	['project-form', decodeProjectModal],
	['project-pick', (parts) => (parts.length ? null : { kind: 'project-select' })],
	[
		'dashboard',
		([action, ...rest]) => {
			const known = dashboardButtons.find((candidate) => candidate === action);
			return known && !rest.length ? { kind: 'dashboard-button', action: known } : null;
		}
	],
	['manage', (parts) => withOptionalId(parts, manageButtons, (action, id) => ({ kind: 'manage-button', action, id }))],
	[
		'manage-pick',
		([action, ...rest]) => {
			const known = manageMenus.find((candidate) => candidate === action);
			return known && !rest.length ? { kind: 'manage-menu', action: known } : null;
		}
	],
	['manage-form', (parts) => withOptionalId(parts, manageModals, (action, id) => ({ kind: 'manage-modal', action, id }))],
	['settings', (parts) => (parts.length ? null : { kind: 'settings-modal' })],
	['dashboard-request-for', (parts) => (parts.length ? null : { kind: 'dashboard-request-for' })],
	['share-pick', ([id, ...rest]) => (isDigits(id) && !rest.length ? { kind: 'share-select', projectId: Number(id) } : null)],
	[
		'appropriation-report',
		([month = '', ...rest]) => (parseMonth(month) === month && !rest.length ? { kind: 'appropriation-report-button', month } : null)
	],
	['appropriation-report-form', (parts) => (parts.length ? null : { kind: 'appropriation-report-modal' })]
]);

function decodeProjectButton(parts: string[]): CustomId | null {
	if (parts.length === 1 && parts[0] === 'create') return { kind: 'project-button', action: 'create' };
	return withAction(parts, projectButtons, (action, projectId) => ({ kind: 'project-button', action, projectId }));
}

function decodeProjectModal(parts: string[]): CustomId | null {
	if (parts.length === 1 && parts[0] === 'create') return { kind: 'project-modal', action: 'create' };
	if (parts[0] === 'edit-share') return withAction(parts, ['edit-share'], (action, shareId) => ({ kind: 'project-modal', action, shareId }));
	return withAction(parts, projectModals, (action, projectId) => ({ kind: 'project-modal', action, projectId }));
}

function decodePayout(parts: string[]): CustomId | null {
	if (parts[0] === 'generate') {
		const [, userId, ...rest] = parts;
		return isDigits(userId) && !rest.length ? { kind: 'payout-button', action: 'generate', employeeUserId: userId } : null;
	}
	if (parts[0] === 'show') return withAction(parts, ['show'], (action, payoutNumber) => ({ kind: 'payout-button', action, payoutNumber }));
	return decodeSettle(parts);
}

/** Buttons made before Payouts had revisions carry none, and every Payout then was at revision 1. */
function decodeSettle(parts: string[]): CustomId | null {
	const [action, number, revision = '1', ...rest] = parts;
	const known = settleActions.find((candidate) => candidate === action);
	if (!known || !isDigits(number) || !isDigits(revision) || rest.length) return null;
	return { kind: 'payout-button', action: known, payoutNumber: Number(number), revision: Number(revision) };
}

function inHome(home: string | undefined, rest: string[], build: (userId: string | null) => CustomId): CustomId | null {
	return isDigits(home) ? optionalUser(rest, build) : null;
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

function withOptionalId<A extends string>(
	parts: string[],
	actions: readonly A[],
	build: (action: A, id: number | null) => CustomId
): CustomId | null {
	const [action, id, ...rest] = parts;
	const known = actions.find((candidate) => candidate === action);
	if (!known || rest.length) return null;
	if (id === undefined) return build(known, null);
	return isDigits(id) ? build(known, Number(id)) : null;
}

function isDigits(part: string | undefined): part is string {
	return /^\d+$/.test(part ?? '');
}

function join(...parts: (string | number | null)[]): string {
	return parts.filter((part) => part !== null).join(':');
}
