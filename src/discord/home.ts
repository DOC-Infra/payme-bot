import { container } from '@sapphire/framework';
import { getEmployee } from '../core';
import { saveHome, selectHome } from '../storage/app';
import { chooseHome, type HomeChoice } from './homeChoice';
import { appStorage, isPayMeServer, payMeFor } from './servers';

/**
 * Where a request for `employeeUserId`, filed by `actorUserId`, goes. In a PayMe server, that server. Anywhere else, such as another
 * server or a DM where PayMe is someone's user app, a PayMe server where the Employee is hired and the actor is a member.
 */
export function homeFor(guildId: string | null, actorUserId: string, employeeUserId: string): HomeChoice {
	if (isPayMeServer(guildId)) return { kind: 'home', guildId };
	return chooseHome(homeCandidates(actorUserId, employeeUserId), selectHome(appStorage(), actorUserId));
}

export function rememberHome(userId: string, guildId: string) {
	saveHome(appStorage(), userId, guildId);
}

/** The PayMe servers the user is a member of: the ones they can pick as their home. */
export function memberServers(userId: string): string[] {
	return [...container.client.guilds.cache.filter((guild) => guild.members.cache.has(userId)).keys()];
}

function homeCandidates(actorUserId: string, employeeUserId: string): string[] {
	return memberServers(actorUserId).filter((guildId) => getEmployee(payMeFor(guildId), employeeUserId) !== null);
}

export function serverName(guildId: string): string {
	return container.client.guilds.cache.get(guildId)?.name ?? guildId;
}
