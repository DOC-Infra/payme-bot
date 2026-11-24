import { describe, expect, it } from 'vitest';
import { employeeCategoryId, setEmployeeCategory } from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

describe('The Employee Channel category', () => {
	it("is PayMe's own until an administrator picks one, which only they can", () => {
		const payMe = createTestPayMe();

		expect(employeeCategoryId(payMe)).toBeNull();
		expect(setEmployeeCategory(payMe, member('user-casey', 'role-manager'), 'category-staff')).toEqual({
			ok: false,
			error: { code: 'not-permitted' }
		});
		expect(setEmployeeCategory(payMe, leadership(), 'category-staff')).toMatchObject({
			ok: true,
			effects: [{ card: { description: 'New Employee Channels will be created in <#category-staff>.' } }]
		});
		expect(employeeCategoryId(payMe)).toBe('category-staff');
	});

	it('is kept separately by each server', () => {
		const first = createTestPayMe();
		const second = createTestPayMe();
		setEmployeeCategory(first, leadership(), 'category-first');

		expect(employeeCategoryId(second)).toBeNull();
	});
});
