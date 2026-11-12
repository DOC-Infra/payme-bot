import { saveEmployee, selectEmployee, selectEmployeeIdByChannel, selectEmployees, updateRequestsThread } from '../storage/employees';
import type { Actor } from './actor';
import { notice, type Card, type Effect } from './effects';
import { channelViewerRoleIds } from './job-membership';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { requireLeadership } from './permissions';

export interface Employee {
	userId: string;
	minecraftName: string;
	channelId: string | null;
	threadId: string | null;
	pinnedMessageId: string | null;
}

export function getEmployee(payMe: PayMe, userId: string): Employee | null {
	return selectEmployee(payMe.storage, userId);
}

export function allEmployees(payMe: PayMe): Employee[] {
	return selectEmployees(payMe.storage);
}

export interface RequestsThreadIds {
	channelId: string;
	pinnedMessageId: string;
	threadId: string;
}

export function recordRequestsThread(payMe: PayMe, userId: string, ids: RequestsThreadIds) {
	updateRequestsThread(payMe.storage, userId, ids);
}

/** Checks that the actor may hire the member, for example before asking them for a Minecraft Name. */
export function checkHire(payMe: PayMe, actor: Actor, hiree: Actor): Failure | null {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	return getEmployee(payMe, hiree.userId) ? fail({ code: 'already-employee' }) : null;
}

export function hireEmployee(payMe: PayMe, actor: Actor, hiree: Actor, minecraftName: string): Outcome<Employee> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	if (!isValidMinecraftName(minecraftName)) return fail({ code: 'invalid-minecraft-name', name: minecraftName });

	const { storage } = payMe;
	return storage.transaction(() => {
		if (selectEmployee(storage, hiree.userId)) return fail({ code: 'already-employee' });

		saveEmployee(storage, { userId: hiree.userId, minecraftName, channelId: null, threadId: null, pinnedMessageId: null });
		const effects: Effect[] = [
			{
				type: 'create-employee-channel',
				employeeUserId: hiree.userId,
				name: minecraftName.toLowerCase(),
				viewerUserIds: [hiree.userId],
				viewerRoleIds: channelViewerRoleIds(payMe, hiree),
				...requestsThreadStart(hiree.userId, minecraftName)
			},
			logEntry(hiree.userId, `Hired by <@${actor.userId}> with Minecraft Name ${minecraftName}.`),
			{ type: 'private-reply', card: notice(`Hired <@${hiree.userId}> with Minecraft Name ${minecraftName}.`) }
		];
		return succeed(effects, selectEmployee(storage, hiree.userId)!);
	});
}

export function linkEmployee(payMe: PayMe, actor: Actor, linked: Actor, minecraftName: string, channelId: string): Outcome<Employee> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	if (!isValidMinecraftName(minecraftName)) return fail({ code: 'invalid-minecraft-name', name: minecraftName });

	const { storage } = payMe;
	return storage.transaction(() => {
		const { userId } = linked;
		const holder = selectEmployeeIdByChannel(storage, channelId);
		if (holder !== null && holder !== userId) return fail({ code: 'employee-channel-taken', channelId });

		const existing = selectEmployee(storage, userId);
		const reuse = existing !== null && existing.channelId === channelId && existing.threadId !== null;
		saveEmployee(storage, reuse ? { ...existing, minecraftName } : { userId, minecraftName, channelId, threadId: null, pinnedMessageId: null });

		const effects: Effect[] = reuse
			? []
			: [
					{ type: 'grant-channel-access', channelId, roleIds: channelViewerRoleIds(payMe, linked) },
					{ type: 'start-requests-thread', employeeUserId: userId, channelId, ...requestsThreadStart(userId, minecraftName) }
				];
		for (const change of linkChanges(existing, minecraftName, channelId, `<@${actor.userId}>`)) effects.push(logEntry(userId, change));
		effects.push({ type: 'private-reply', card: notice(`Linked <@${userId}> to <#${channelId}> with Minecraft Name ${minecraftName}.`) });
		return succeed(effects, selectEmployee(storage, userId)!);
	});
}

function linkChanges(existing: Employee | null, minecraftName: string, channelId: string, by: string): string[] {
	if (!existing) return [`Linked to <#${channelId}> by ${by} with Minecraft Name ${minecraftName}.`];

	const changes: string[] = [];
	if (existing.channelId !== channelId) {
		changes.push(existing.channelId ? `Moved from <#${existing.channelId}> to <#${channelId}> by ${by}.` : `Linked to <#${channelId}> by ${by}.`);
	}
	if (existing.minecraftName !== minecraftName) changes.push(`Minecraft Name changed from ${existing.minecraftName} to ${minecraftName} by ${by}.`);
	return changes;
}

function requestsThreadStart(userId: string, minecraftName: string) {
	return { pinnedMessage: pinnedMessageCard(userId, minecraftName), threadName: `Requests: ${minecraftName}` };
}

/** The pinned message at the top of an Employee Channel, which the Requests Thread starts from. */
export function pinnedMessageCard(userId: string, minecraftName: string): Card {
	return {
		tone: 'info',
		title: minecraftName,
		description:
			'Press **Request payment** to claim pay for a Task, or **Claim ticket** to claim a DOC ticket by its number. Every request and its outcome is logged in the Requests Thread below.',
		fields: [
			{ name: 'Employee', value: `<@${userId}>`, inline: true },
			{ name: 'Minecraft Name', value: minecraftName, inline: true }
		]
	};
}

function logEntry(employeeUserId: string, text: string): Effect {
	return { type: 'post-to-requests-thread', employeeUserId, card: notice(text, 'neutral'), ping: false };
}

function isValidMinecraftName(name: string): boolean {
	return /^\w{3,16}$/.test(name);
}
