import { createPayMe, type Actor, type PayMe, type RequestMessage, type RoundRecorder } from '../../src/core';
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

export interface RecordedMessage {
	requestNumber: number;
	message: RequestMessage;
}

/** A `RoundRecorder` that keeps what it is given, in order. */
export function recordingRecorder(): RoundRecorder & { recorded: RecordedMessage[] } {
	const recorded: RecordedMessage[] = [];
	return { recorded, recordMessage: (requestNumber, message) => recorded.push({ requestNumber, message }) };
}
