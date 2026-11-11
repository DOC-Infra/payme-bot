import { createPayMe, type Actor, type PayMe } from '../../src/core';
import { openStorage } from '../../src/storage/storage';

export const leadershipRoleId = 'role-leadership';

export function createTestPayMe(): PayMe {
	return createPayMe(openStorage(':memory:'), { leadershipRoleId });
}

export function member(userId: string, ...roleIds: string[]): Actor {
	return { userId, roleIds };
}

export function leadership(userId = 'user-leadership'): Actor {
	return member(userId, leadershipRoleId);
}
