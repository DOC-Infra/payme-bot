export type Effect =
	| PrivateReply
	| CreateEmployeeChannel
	| StartRequestsThread
	| GrantChannelAccess
	| PostToRequestsThread
	| PostRequestEntry
	| PostReviewMessage
	| UpdateReviewCopies
	| ShowPayout
	| ShowPayouts
	| UpdateEntryActions
	| UpdateRequestEntry
	| DeleteReviewCopies;

/** A button the Employee gets on a request's Requests Thread entry. */
export type EntryAction = 'amend' | 'withdraw';

export interface EvidenceFile {
	name: string;
	url: string;
}

/** How a message looks: Discord shows it as an embed coloured by its tone. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface CardField {
	name: string;
	value: string;
	inline?: boolean;
}

export interface Card {
	tone: Tone;
	title?: string;
	description?: string;
	fields?: CardField[];
	footer?: string;
}

export function notice(description: string, tone: Tone = 'success'): Card {
	return { tone, description };
}

/** A message PayMe posted in Discord. */
export interface MessageRef {
	channelId: string;
	messageId: string;
}

export interface PrivateReply {
	type: 'private-reply';
	card: Card;
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
	pinnedMessage: Card;
	threadName: string;
}

/** Post and pin the message in an existing channel, start the Requests Thread from it, then report the IDs back with `recordRequestsThread`. */
export interface StartRequestsThread {
	type: 'start-requests-thread';
	employeeUserId: string;
	channelId: string;
	pinnedMessage: Card;
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
	card: Card;
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
	card: Card;
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

/** Replace the card and buttons on this round's Requests Thread entry, keeping its files. */
export interface UpdateRequestEntry {
	type: 'update-request-entry';
	requestNumber: number;
	round: number;
	card: Card;
	actions: EntryAction[];
}

/** Delete these review copies of the request. */
export interface DeleteReviewCopies {
	type: 'delete-review-copies';
	requestNumber: number;
	messages: MessageRef[];
}

/** Edit these review copies of this round in place: replace their card and remove the review buttons, keeping the link to the thread entry. */
export interface UpdateReviewCopies {
	type: 'update-review-copies';
	requestNumber: number;
	round: number;
	messages: MessageRef[];
	card: Card;
}

/**
 * Post a review copy in a Job's Review Channel, re-uploading the files and linking to the round's Requests Thread entry
 * (see `requestEntry`), then report the message back with `recordRequestMessage`.
 */
export interface PostReviewMessage {
	type: 'post-review-message';
	requestNumber: number;
	round: number;
	jobId: number;
	channelId: string;
	card: Card;
	files: EvidenceFile[];
}

/** Show a Payout privately to the actor, with Mark paid and Discard buttons when `settleButtons` is set. */
export interface ShowPayout {
	type: 'show-payout';
	payoutNumber: number;
	card: Card;
	settleButtons: boolean;
}

export type PayoutAction = { kind: 'generate'; employeeUserId: string; label: string } | { kind: 'show'; payoutNumber: number; label: string };

/** Show the payouts view privately to the actor, with one button per action. */
export interface ShowPayouts {
	type: 'show-payouts';
	card: Card;
	actions: PayoutAction[];
}
