export type Effect =
	| PrivateReply
	| CreateEmployeeChannel
	| StartRequestsThread
	| GrantChannelAccess
	| PostToRequestsThread
	| PostRequestEntry
	| PostReviewMessage
	| UpdateReviewCopies
	| UpdateEntryActions;

/** A button the Employee gets on a request's Requests Thread entry. */
export type EntryAction = 'amend' | 'withdraw';

export interface EvidenceFile {
	name: string;
	url: string;
}

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

/**
 * Post a request's entry for this submission round to the Employee's current Requests Thread (reopening it if archived),
 * re-uploading the files, then report the message back with `recordRequestMessage` (`jobId: null`).
 */
export interface PostRequestEntry {
	type: 'post-request-entry';
	requestNumber: number;
	round: number;
	employeeUserId: string;
	content: string;
	files: EvidenceFile[];
	actions: EntryAction[];
}

/** Replace the buttons on this round's Requests Thread entry. */
export interface UpdateEntryActions {
	type: 'update-entry-actions';
	requestNumber: number;
	round: number;
	actions: EntryAction[];
}

/**
 * Post a review copy in a Job's Review Channel, re-uploading the files and linking to the round's Requests Thread entry
 * (see `requestEntry`), then report the message back with `recordRequestMessage`.
 */
/** Edit every recorded review copy of this round in place: replace its text and remove the review buttons, keeping the link to the thread entry. */
export interface UpdateReviewCopies {
	type: 'update-review-copies';
	requestNumber: number;
	round: number;
	content: string;
}

export interface PostReviewMessage {
	type: 'post-review-message';
	requestNumber: number;
	round: number;
	jobId: number;
	channelId: string;
	content: string;
	files: EvidenceFile[];
}
