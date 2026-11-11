import { describe, expect, it } from 'vitest';
import { describeError, requireLeadership } from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

describe('Leadership permission', () => {
	it('lets a member holding the Leadership role through', () => {
		const payMe = createTestPayMe();

		expect(requireLeadership(payMe, leadership())).toBeNull();
	});

	it('refuses a member without the Leadership role', () => {
		const payMe = createTestPayMe();

		const outcome = requireLeadership(payMe, member('user-1', 'role-courier'));

		expect(outcome).toEqual({ ok: false, error: { code: 'not-permitted' } });
		expect(outcome && !outcome.ok && describeError(outcome.error)).toBe('Only Leadership can do that.');
	});
});
