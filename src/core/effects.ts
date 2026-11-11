export type Effect = PrivateReply | CreateEmployeeChannel | StartRequestsThread | GrantChannelAccess | PostToRequestsThread;

export interface PrivateReply {
	type: 'private-reply';
	content: string;
}

/**
 * Create a private channel in the Employee Channel category that only the viewers can see, post and pin the message,
 * start the Requests Thread from it, then report the IDs back with `recordRequestsThread`.
 */
export interface CreateEmployeeChannel {
	type: 'create-employee-channel';
	employeeUserId: string;
	name: string;
	viewerUserIds: string[];
	viewerRoleIds: string[];
	pinnedMessage: string;
	threadName: string;
}

/** Post and pin the message in an existing channel, start the Requests Thread from it, then report the IDs back with `recordRequestsThread`. */
export interface StartRequestsThread {
	type: 'start-requests-thread';
	employeeUserId: string;
	channelId: string;
	pinnedMessage: string;
	threadName: string;
}

/** Let these roles view the channel, keeping every other permission as it is. */
export interface GrantChannelAccess {
	type: 'grant-channel-access';
	channelId: string;
	roleIds: string[];
}

/** Post to the Employee's current Requests Thread, reopening it first if it was archived. */
export interface PostToRequestsThread {
	type: 'post-to-requests-thread';
	employeeUserId: string;
	content: string;
	ping: boolean;
}
