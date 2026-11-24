import { container } from '@sapphire/framework';
import { getJob } from '../core';
import { payMeFor } from './servers';

/** The members of the server who hold the Job's Employee role now. */
export async function holderUserIds(guildId: string, jobId: number): Promise<string[]> {
	const employeeRoleId = getJob(payMeFor(guildId), jobId)?.employeeRoleId;
	if (!employeeRoleId) return [];

	const guild = await container.client.guilds.fetch(guildId);
	return [...guild.members.cache.filter((member) => member.roles.cache.has(employeeRoleId)).keys()];
}
