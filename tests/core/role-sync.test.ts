import { describe, expect, it } from 'vitest';
import { addManagerRole, createJob, hireEmployee, recordRequestsThread, syncJobRoles, type Outcome, type PayMe } from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

function courierJob(payMe: PayMe) {
	const courier = created(createJob(payMe, leadership(), { name: 'Courier', employeeRoleId: 'role-courier', reviewChannelId: 'review-courier' }));
	addManagerRole(payMe, leadership(), courier.id, 'role-courier-manager', []);
	return courier;
}

function hire(payMe: PayMe, userId: string, channelId: string) {
	hireEmployee(payMe, leadership(), member(userId), userId.replace('-', '_'));
	recordRequestsThread(payMe, userId, { channelId, pinnedMessageId: `pin-${userId}`, threadId: `thread-${userId}` });
}

describe('Role sync', () => {
	it("gives a Job's Managers access to an Employee Channel when the Employee gains that Job's role", () => {
		const payMe = createTestPayMe();
		courierJob(payMe);
		hire(payMe, 'user-alex', 'channel-alex');

		expect(syncJobRoles(payMe, 'user-alex', ['role-other'], ['role-other', 'role-courier'])).toEqual({
			ok: true,
			value: undefined,
			effects: [{ type: 'grant-channel-access', channelId: 'channel-alex', roleIds: ['role-courier-manager'] }]
		});
	});

	it('removes no access when an Employee loses a Job role', () => {
		const payMe = createTestPayMe();
		courierJob(payMe);
		hire(payMe, 'user-alex', 'channel-alex');

		expect(syncJobRoles(payMe, 'user-alex', ['role-courier'], [])).toEqual({ ok: true, value: undefined, effects: [] });
	});

	it('does nothing when a member who has not been hired gains a Job role', () => {
		const payMe = createTestPayMe();
		courierJob(payMe);

		expect(syncJobRoles(payMe, 'user-alex', [], ['role-courier'])).toEqual({ ok: true, value: undefined, effects: [] });
	});

	it('gives a new manager role access to the Employee Channels of every current holder of the Job', () => {
		const payMe = createTestPayMe();
		const courier = courierJob(payMe);
		hire(payMe, 'user-alex', 'channel-alex');
		hire(payMe, 'user-sam', 'channel-sam');

		const outcome = addManagerRole(payMe, leadership(), courier.id, 'role-courier-lead', ['user-alex', 'user-sam', 'user-pat']);

		expect(outcome.ok && outcome.effects).toEqual([
			{ type: 'grant-channel-access', channelId: 'channel-alex', roleIds: ['role-courier-lead'] },
			{ type: 'grant-channel-access', channelId: 'channel-sam', roleIds: ['role-courier-lead'] },
			{ type: 'private-reply', content: '<@&role-courier-lead> now manages the Courier Job.' }
		]);
	});
});
