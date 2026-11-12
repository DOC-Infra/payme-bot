import { describe, expect, it } from 'vitest';
import { decodeCustomId, encodeCustomId, type CustomId } from '../../src/discord/customIds';

const user = '123456789012345678';

const everyKind: CustomId[] = [
	{ kind: 'request-button' },
	{ kind: 'claim-ticket-button' },
	{ kind: 'claim-ticket-modal' },
	{ kind: 'request-job-select', employeeUserId: null },
	{ kind: 'request-job-select', employeeUserId: user },
	{ kind: 'request-modal', employeeUserId: null },
	{ kind: 'request-modal', employeeUserId: user },
	{ kind: 'hire-modal', hireeUserId: user },
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
	{ kind: 'payout-button', action: 'paid', payoutNumber: 3 },
	{ kind: 'payout-button', action: 'discard', payoutNumber: 3 }
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
		'request:not-a-user',
		'request:1:2',
		'hire',
		'hire:abc',
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
		['payout:paid:3', { kind: 'payout-button', action: 'paid', payoutNumber: 3 }],
		['payout:discard:3', { kind: 'payout-button', action: 'discard', payoutNumber: 3 }]
	])('decodes %j from messages already posted', (customId, id) => {
		expect(decodeCustomId(customId)).toEqual(id);
	});

	it('keeps the Claim ticket button and modal apart', () => {
		expect(encodeCustomId({ kind: 'claim-ticket-button' })).not.toBe(encodeCustomId({ kind: 'claim-ticket-modal' }));
	});
});
