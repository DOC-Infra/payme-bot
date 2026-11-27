import { describe, expect, it } from 'vitest';
import { decodeCustomId, encodeCustomId, type CustomId } from '../../src/discord/customIds';

const user = '123456789012345678';

const everyKind: CustomId[] = [
	{ kind: 'request-button' },
	{ kind: 'claim-ticket-button' },
	{ kind: 'claim-ticket-modal', home: null },
	{ kind: 'claim-ticket-modal', home: user },
	{ kind: 'ticket-home-pick' },
	{ kind: 'request-job-select', home: user, employeeUserId: null },
	{ kind: 'request-job-select', home: user, employeeUserId: user },
	{ kind: 'request-modal', home: user, employeeUserId: null },
	{ kind: 'request-modal', home: user, employeeUserId: user },
	{ kind: 'home-pick', employeeUserId: null },
	{ kind: 'home-pick', employeeUserId: user },
	{ kind: 'home-set' },
	{ kind: 'hire-modal', hireeUserId: user },
	{ kind: 'link-modal', userId: user, channelId: user },
	{ kind: 'entry-button', action: 'amend', requestNumber: 12 },
	{ kind: 'entry-button', action: 'withdraw', requestNumber: 12 },
	{ kind: 'entry-button', action: 'confirm-withdraw', requestNumber: 12 },
	{ kind: 'amend-modal', requestNumber: 12 },
	{ kind: 'review-button', action: 'approve', requestNumber: 12 },
	{ kind: 'review-button', action: 'reject', requestNumber: 12 },
	{ kind: 'review-button', action: 'deny', requestNumber: 12 },
	{ kind: 'reason-modal', action: 'reject', requestNumber: 12 },
	{ kind: 'reason-modal', action: 'deny', requestNumber: 12 },
	{ kind: 'payout-button', action: 'generate', employeeUserId: user },
	{ kind: 'payout-button', action: 'show', payoutNumber: 3 },
	{ kind: 'payout-button', action: 'paid', payoutNumber: 3, revision: 2 },
	{ kind: 'payout-button', action: 'discard', payoutNumber: 3, revision: 1 },
	{ kind: 'project-button', action: 'create' },
	{ kind: 'project-button', action: 'share', projectId: 4 },
	{ kind: 'project-button', action: 'change-share', projectId: 4 },
	{ kind: 'project-button', action: 'fund', projectId: 4 },
	{ kind: 'project-button', action: 'close', projectId: 4 },
	{ kind: 'project-button', action: 'confirm-close', projectId: 4 },
	{ kind: 'project-modal', action: 'create' },
	{ kind: 'project-modal', action: 'share', projectId: 4 },
	{ kind: 'project-modal', action: 'fund', projectId: 4 },
	{ kind: 'project-modal', action: 'edit-share', shareId: 9 },
	{ kind: 'project-select' },
	{ kind: 'share-select', projectId: 4 },
	{ kind: 'dashboard-button', action: 'payouts' },
	{ kind: 'dashboard-button', action: 'projects' },
	{ kind: 'dashboard-button', action: 'tasks' },
	{ kind: 'dashboard-request-for' },
	{ kind: 'dashboard-button', action: 'jobs' },
	{ kind: 'dashboard-button', action: 'settings' },
	{ kind: 'settings-modal' },
	{ kind: 'manage-button', action: 'new-job', id: null },
	{ kind: 'manage-button', action: 'new-task', id: null },
	{ kind: 'manage-button', action: 'new-task', id: 3 },
	{ kind: 'manage-button', action: 'confirm-retire-job', id: 3 },
	{ kind: 'manage-button', action: 'restore-task', id: 7 },
	{ kind: 'manage-menu', action: 'open-job' },
	{ kind: 'manage-menu', action: 'open-job-tasks' },
	{ kind: 'manage-menu', action: 'open-task' },
	{ kind: 'manage-modal', action: 'new-job', id: null },
	{ kind: 'manage-modal', action: 'edit-task', id: 7 },
	{ kind: 'manage-modal', action: 'task-jobs', id: 7 },
	{ kind: 'dashboard-button', action: 'categories' },
	{ kind: 'manage-button', action: 'new-category', id: null },
	{ kind: 'manage-button', action: 'edit-category', id: 2 },
	{ kind: 'manage-button', action: 'retire-category', id: 2 },
	{ kind: 'manage-button', action: 'restore-category', id: 2 },
	{ kind: 'manage-menu', action: 'open-category' },
	{ kind: 'manage-modal', action: 'new-category', id: null },
	{ kind: 'manage-modal', action: 'edit-category', id: 2 },
	{ kind: 'appropriation-report-button', month: '2026-11' },
	{ kind: 'appropriation-report-modal' }
];

describe('custom IDs', () => {
	it.each(everyKind)('round-trips %o', (id) => {
		expect(decodeCustomId(encodeCustomId(id))).toEqual(id);
	});

	it('gives every ID its own string', () => {
		const encoded = everyKind.map(encodeCustomId);
		expect(new Set(encoded).size).toBe(encoded.length);
	});

	it.each([
		'',
		'unknown',
		'request-payment:extra',
		'claim-ticket:1',
		'request',
		'request:not-a-server',
		'request:1:not-a-user',
		'request:1:2:3',
		'request-job',
		'home-pick:x',
		'home-set:1',
		'claim-ticket-modal:abc',
		'ticket-home-pick:1',
		'hire',
		'hire:abc',
		'link:1',
		'link:1:abc',
		'link:1:2:3',
		'entry:amend',
		'entry:approve:12',
		'entry:amend:twelve',
		'entry:amend:12:3',
		'amend:',
		'review:withdraw:12',
		'review:approve:-1',
		'review-reason:approve:12',
		'payout:generate',
		'payout:show:abc',
		'payout:settle:3',
		'payout:paid:3:x',
		'payout:show:3:2',
		'project:create:4',
		'project:share',
		'project:remove:4',
		'project-form:close:4',
		'project-form:edit-share',
		'project-pick:4',
		'share-pick',
		'dashboard',
		'dashboard:hire',
		'dashboard:payouts:1',
		'dashboard-request-for:1',
		'manage',
		'settings:1',
		'manage:delete-job:3',
		'manage:edit-job:x',
		'manage:edit-job:3:4',
		'manage-pick:open-job:3',
		'manage-form:retire-job:3',
		'appropriation-report',
		'appropriation-report:2026-13',
		'appropriation-report:2026-11:1',
		'appropriation-report-form:1',
		'constructor'
	])('rejects %j', (customId) => {
		expect(decodeCustomId(customId)).toBeNull();
	});

	it.each<[string, CustomId]>([
		['request-payment', { kind: 'request-button' }],
		['claim-ticket', { kind: 'claim-ticket-button' }],
		['entry:amend:12', { kind: 'entry-button', action: 'amend', requestNumber: 12 }],
		['entry:withdraw:12', { kind: 'entry-button', action: 'withdraw', requestNumber: 12 }],
		['review:approve:12', { kind: 'review-button', action: 'approve', requestNumber: 12 }],
		['review:reject:12', { kind: 'review-button', action: 'reject', requestNumber: 12 }],
		['review:deny:12', { kind: 'review-button', action: 'deny', requestNumber: 12 }],
		[`payout:generate:${user}`, { kind: 'payout-button', action: 'generate', employeeUserId: user }],
		['payout:show:3', { kind: 'payout-button', action: 'show', payoutNumber: 3 }],
		['payout:paid:3', { kind: 'payout-button', action: 'paid', payoutNumber: 3, revision: 1 }],
		['payout:discard:3', { kind: 'payout-button', action: 'discard', payoutNumber: 3, revision: 1 }],
		['payout:paid:3:2', { kind: 'payout-button', action: 'paid', payoutNumber: 3, revision: 2 }]
	])('decodes %j from messages already posted', (customId, id) => {
		expect(decodeCustomId(customId)).toEqual(id);
	});

	it('keeps the Claim ticket button and modal apart', () => {
		expect(encodeCustomId({ kind: 'claim-ticket-button' })).not.toBe(encodeCustomId({ kind: 'claim-ticket-modal', home: null }));
	});
});
