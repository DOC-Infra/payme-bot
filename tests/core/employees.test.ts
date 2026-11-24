import { describe, expect, it } from 'vitest';
import {
	setManagerRoles,
	checkHire,
	createJob,
	getEmployee,
	hireEmployee,
	checkEmployeeLink,
	linkEmployee,
	pinnedMessageCard,
	recordRequestsThread,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

describe('Hiring', () => {
	it('lets Leadership hire a member, creating an Employee Channel visible to the Employee and Leadership', () => {
		const payMe = createTestPayMe();

		const outcome = hireEmployee(payMe, leadership(), member('user-alex'), 'Alex_42');

		expect(outcome.ok && outcome.effects[0]).toEqual({
			type: 'create-employee-channel',
			employeeUserId: 'user-alex',
			name: 'alex_42',
			viewerUserIds: ['user-alex'],
			viewerRoleIds: [],
			pinnedMessage: pinnedMessageCard('user-alex', 'Alex_42'),
			threadName: 'Requests: Alex_42'
		});
		expect(getEmployee(payMe, 'user-alex')).toEqual({
			userId: 'user-alex',
			minecraftName: 'Alex_42',
			channelId: null,
			threadId: null,
			pinnedMessageId: null
		});
	});

	it('also lets Managers of the Jobs the member already holds see the new Employee Channel', () => {
		const payMe = createTestPayMe();
		const courier = created(
			createJob(payMe, leadership(), { name: 'Courier', employeeRoleId: 'role-courier', reviewChannelId: 'review-courier' })
		);
		const miner = created(createJob(payMe, leadership(), { name: 'Miner', employeeRoleId: 'role-miner', reviewChannelId: 'review-miner' }));
		setManagerRoles(payMe, leadership(), courier.id, ['role-courier-manager'], []);
		setManagerRoles(payMe, leadership(), miner.id, ['role-miner-manager'], []);

		const outcome = hireEmployee(payMe, leadership(), member('user-alex', 'role-courier'), 'Alex_42');

		expect(outcome.ok && outcome.effects[0]).toMatchObject({ viewerRoleIds: ['role-courier-manager'] });
	});

	it('logs the hiring and Minecraft Name in the new Requests Thread without pinging the Employee', () => {
		const payMe = createTestPayMe();

		const outcome = hireEmployee(payMe, leadership('user-boss'), member('user-alex'), 'Alex_42');

		expect(outcome.ok && outcome.effects.slice(1)).toEqual([
			{
				type: 'post-to-requests-thread',
				employeeUserId: 'user-alex',
				card: { tone: 'neutral', description: 'Hired by <@user-boss> with Minecraft Name Alex_42.' },
				ping: false
			},
			{ type: 'private-reply', card: { tone: 'success', description: 'Hired <@user-alex> with Minecraft Name Alex_42.' } }
		]);
	});

	it('records the Employee Channel, pinned message and Requests Thread once they exist in Discord', () => {
		const payMe = createTestPayMe();
		hireEmployee(payMe, leadership(), member('user-alex'), 'Alex_42');

		recordRequestsThread(payMe, 'user-alex', { channelId: 'channel-alex', pinnedMessageId: 'message-pin', threadId: 'thread-alex' });

		expect(getEmployee(payMe, 'user-alex')).toEqual({
			userId: 'user-alex',
			minecraftName: 'Alex_42',
			channelId: 'channel-alex',
			pinnedMessageId: 'message-pin',
			threadId: 'thread-alex'
		});
	});

	it('refuses to hire a member who is already an Employee', () => {
		const payMe = createTestPayMe();
		hireEmployee(payMe, leadership(), member('user-alex'), 'Alex_42');

		expect(hireEmployee(payMe, leadership(), member('user-alex'), 'Someone_Else')).toEqual({
			ok: false,
			error: { code: 'already-employee' }
		});
		expect(getEmployee(payMe, 'user-alex')?.minecraftName).toBe('Alex_42');
	});

	it('refuses a Minecraft Name that could not appear in a Pay Command', () => {
		const payMe = createTestPayMe();

		for (const name of ['Al', 'Alex 42', 'Alex;payout', 'A_name_far_too_long']) {
			expect(hireEmployee(payMe, leadership(), member('user-alex'), name)).toEqual({
				ok: false,
				error: { code: 'invalid-minecraft-name', name }
			});
		}
		expect(getEmployee(payMe, 'user-alex')).toBeNull();
	});

	it('refuses hiring to anyone who is not Leadership', () => {
		const payMe = createTestPayMe();

		expect(hireEmployee(payMe, member('user-manager', 'role-courier-manager'), member('user-alex'), 'Alex_42')).toEqual({
			ok: false,
			error: { code: 'not-permitted' }
		});
		expect(getEmployee(payMe, 'user-alex')).toBeNull();
	});
});

describe('Linking', () => {
	it('checks before asking for a Minecraft Name that the actor is Leadership and no other Employee has the channel', () => {
		const payMe = createTestPayMe();
		created(linkEmployee(payMe, leadership(), member('user-sam'), 'Sam_7', 'channel-sam'));

		expect(checkEmployeeLink(payMe, leadership(), 'user-alex', 'channel-alex')).toBeNull();
		expect(checkEmployeeLink(payMe, leadership(), 'user-sam', 'channel-sam')).toBeNull();
		expect(checkEmployeeLink(payMe, leadership(), 'user-alex', 'channel-sam')).toEqual({
			ok: false,
			error: { code: 'employee-channel-taken', channelId: 'channel-sam' }
		});
		expect(checkEmployeeLink(payMe, member('user-casey', 'role-courier-manager'), 'user-alex', 'channel-alex')).toEqual({
			ok: false,
			error: { code: 'not-permitted' }
		});
	});

	it("lets Leadership link a member to their existing channel, making it visible to their Jobs' Managers and starting a Requests Thread there", () => {
		const payMe = createTestPayMe();
		const courier = created(
			createJob(payMe, leadership(), { name: 'Courier', employeeRoleId: 'role-courier', reviewChannelId: 'review-courier' })
		);
		setManagerRoles(payMe, leadership(), courier.id, ['role-courier-manager'], []);

		const outcome = linkEmployee(payMe, leadership('user-boss'), member('user-sam', 'role-courier'), 'Sam_7', 'channel-sam');

		expect(outcome.ok && outcome.effects).toEqual([
			{ type: 'sync-employee-channel', channelId: 'channel-sam', employeeUserId: 'user-sam', viewerRoleIds: ['role-courier-manager'] },
			{
				type: 'start-requests-thread',
				employeeUserId: 'user-sam',
				channelId: 'channel-sam',
				pinnedMessage: pinnedMessageCard('user-sam', 'Sam_7'),
				threadName: 'Requests: Sam_7'
			},
			{
				type: 'post-to-requests-thread',
				employeeUserId: 'user-sam',
				card: { tone: 'neutral', description: 'Linked to <#channel-sam> by <@user-boss> with Minecraft Name Sam_7.' },
				ping: false
			},
			{ type: 'private-reply', card: { tone: 'success', description: 'Linked <@user-sam> to <#channel-sam> with Minecraft Name Sam_7.' } }
		]);
		expect(getEmployee(payMe, 'user-sam')).toEqual({
			userId: 'user-sam',
			minecraftName: 'Sam_7',
			channelId: 'channel-sam',
			threadId: null,
			pinnedMessageId: null
		});
	});

	it('reuses the existing Requests Thread when re-linking to the same channel, still syncing who can see it, and logs the Minecraft Name change', () => {
		const payMe = createTestPayMe();
		hiredWithThread(payMe, 'user-alex', 'Alex_42');

		const outcome = linkEmployee(payMe, leadership('user-boss'), member('user-alex'), 'Alex_43', 'channel-alex');

		expect(outcome.ok && outcome.effects).toEqual([
			{ type: 'sync-employee-channel', channelId: 'channel-alex', employeeUserId: 'user-alex', viewerRoleIds: [] },
			{
				type: 'post-to-requests-thread',
				employeeUserId: 'user-alex',
				card: { tone: 'neutral', description: 'Minecraft Name changed from Alex_42 to Alex_43 by <@user-boss>.' },
				ping: false
			},
			{ type: 'private-reply', card: { tone: 'success', description: 'Linked <@user-alex> to <#channel-alex> with Minecraft Name Alex_43.' } }
		]);
		expect(getEmployee(payMe, 'user-alex')).toEqual({
			userId: 'user-alex',
			minecraftName: 'Alex_43',
			channelId: 'channel-alex',
			pinnedMessageId: 'pin-alex',
			threadId: 'thread-alex'
		});
	});

	it('starts a new Requests Thread when re-linking to a different channel, logging the move there', () => {
		const payMe = createTestPayMe();
		hiredWithThread(payMe, 'user-alex', 'Alex_42');

		const outcome = linkEmployee(payMe, leadership('user-boss'), member('user-alex'), 'Alex_42', 'channel-new');

		expect(outcome.ok && outcome.effects).toEqual([
			{ type: 'sync-employee-channel', channelId: 'channel-new', employeeUserId: 'user-alex', viewerRoleIds: [] },
			{
				type: 'start-requests-thread',
				employeeUserId: 'user-alex',
				channelId: 'channel-new',
				pinnedMessage: pinnedMessageCard('user-alex', 'Alex_42'),
				threadName: 'Requests: Alex_42'
			},
			{
				type: 'post-to-requests-thread',
				employeeUserId: 'user-alex',
				card: { tone: 'neutral', description: 'Moved from <#channel-alex> to <#channel-new> by <@user-boss>.' },
				ping: false
			},
			{ type: 'private-reply', card: { tone: 'success', description: 'Linked <@user-alex> to <#channel-new> with Minecraft Name Alex_42.' } }
		]);
		expect(getEmployee(payMe, 'user-alex')).toEqual({
			userId: 'user-alex',
			minecraftName: 'Alex_42',
			channelId: 'channel-new',
			pinnedMessageId: null,
			threadId: null
		});
	});

	it("refuses to link a member to another Employee's channel", () => {
		const payMe = createTestPayMe();
		hiredWithThread(payMe, 'user-alex', 'Alex_42');

		expect(linkEmployee(payMe, leadership(), member('user-sam'), 'Sam_7', 'channel-alex')).toEqual({
			ok: false,
			error: { code: 'employee-channel-taken', channelId: 'channel-alex' }
		});
		expect(getEmployee(payMe, 'user-sam')).toBeNull();
	});

	it('refuses linking to anyone who is not Leadership, and an invalid Minecraft Name', () => {
		const payMe = createTestPayMe();
		hiredWithThread(payMe, 'user-alex', 'Alex_42');

		expect(linkEmployee(payMe, member('user-alex'), member('user-alex'), 'Thief_1', 'channel-alex')).toEqual({
			ok: false,
			error: { code: 'not-permitted' }
		});
		expect(linkEmployee(payMe, leadership(), member('user-alex'), 'Alex 43', 'channel-alex')).toEqual({
			ok: false,
			error: { code: 'invalid-minecraft-name', name: 'Alex 43' }
		});
		expect(getEmployee(payMe, 'user-alex')?.minecraftName).toBe('Alex_42');
	});

	it("logs nothing when re-linking changes nothing, but still brings the channel's visibility back in line", () => {
		const payMe = createTestPayMe();
		hiredWithThread(payMe, 'user-alex', 'Alex_42');

		const outcome = linkEmployee(payMe, leadership(), member('user-alex'), 'Alex_42', 'channel-alex');

		expect(outcome.ok && outcome.effects).toEqual([
			{ type: 'sync-employee-channel', channelId: 'channel-alex', employeeUserId: 'user-alex', viewerRoleIds: [] },
			{ type: 'private-reply', card: { tone: 'success', description: 'Linked <@user-alex> to <#channel-alex> with Minecraft Name Alex_42.' } }
		]);
	});
});

function hiredWithThread(payMe: PayMe, userId: string, minecraftName: string) {
	hireEmployee(payMe, leadership(), member(userId), minecraftName);
	const name = userId.replace('user-', '');
	recordRequestsThread(payMe, userId, { channelId: `channel-${name}`, pinnedMessageId: `pin-${name}`, threadId: `thread-${name}` });
}

describe('Checking a hire before asking for a Minecraft Name', () => {
	it('lets Leadership hire a member who is not an Employee yet', () => {
		const payMe = createTestPayMe();

		expect(checkHire(payMe, leadership(), member('user-alex'))).toBeNull();
	});

	it('refuses anyone outside Leadership', () => {
		const payMe = createTestPayMe();

		expect(checkHire(payMe, member('user-sam', 'role-courier-manager'), member('user-alex'))).toEqual({
			ok: false,
			error: { code: 'not-permitted' }
		});
	});

	it('refuses a member who is already an Employee', () => {
		const payMe = createTestPayMe();
		created(hireEmployee(payMe, leadership(), member('user-alex'), 'Alex_42'));

		expect(checkHire(payMe, leadership(), member('user-alex'))).toEqual({ ok: false, error: { code: 'already-employee' } });
	});
});
