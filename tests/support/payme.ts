import { createPayMe, type Actor, type PayMe, type RequestMessage, type RoundRecorder } from '../../src/core';
import { openStorage } from '../../src/storage/storage';

export function createTestPayMe(): PayMe {
	return createPayMe(openStorage(':memory:'));
}

export function member(userId: string, ...roleIds: string[]): Actor {
	return { userId, roleIds, administrator: false };
}

/** A server administrator, which makes them Leadership. */
export function leadership(userId = 'user-leadership', ...roleIds: string[]): Actor {
	return { userId, roleIds, administrator: true };
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
