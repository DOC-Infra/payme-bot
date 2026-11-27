export type Effect =
	| PrivateReply
	| PrivateFiles
	| ShowAppropriation
	| PostDisbursement
	| UpdateDisbursement
	| ShowDisbursement
	| ShowDisbursements
	| CreateEmployeeChannel
	| StartRequestsThread
	| GrantChannelAccess
	| SyncEmployeeChannel
	| RevokeChannelAccess
	| RenameChannel
	| PostToRequestsThread
	| PostRound
	| UpdateReviewCopies
	| ShowPayout
	| ShowPayouts
	| ShowProject
	| ShowProjects
	| ShowManage
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

/** A private reply with text files attached. */
export interface PrivateFiles {
	type: 'private-files';
	card: Card;
	files: TextFile[];
}

export interface TextFile {
	name: string;
	content: string;
}

/** A button on a Disbursement's public card. */
export type DisbursementAction = 'withdraw';

/** Post the Disbursement's card publicly where it was requested, then record it with `recordDisbursementCard`. */
export interface PostDisbursement {
	type: 'post-disbursement';
	disbursementNumber: number;
	card: Card;
	actions: DisbursementAction[];
}

/** Rewrite the Disbursement's public card to show its latest state, with the buttons that state allows. */
export interface UpdateDisbursement {
	type: 'update-disbursement';
	disbursementNumber: number;
	card: Card;
	actions: DisbursementAction[];
}

/** What Leadership can do to a Disbursement from its private view. */
export type DisbursementDecision = 'paid' | 'decline' | 'void';

/** Show a Disbursement privately to Leadership, with a button for each decision it still allows. */
export interface ShowDisbursement {
	type: 'show-disbursement';
	disbursementNumber: number;
	card: Card;
	actions: DisbursementDecision[];
}

/** Show a list of Disbursements privately to Leadership, with a button to open each. */
export interface ShowDisbursements {
	type: 'show-disbursements';
	card: Card;
	disbursementNumbers: number[];
}

/** The private `/appropriation` reply for `month`, with a button to make a report. */
export interface ShowAppropriation {
	type: 'show-appropriation';
	card: Card;
	month: string;
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
/**
 * Make an Employee Channel visible to exactly the Employee, PayMe and these roles: let each of them see it, and take away seeing it
 * from every other role, @everyone included. Roles' other permissions and other members' own permissions are left as they are.
 */
export interface SyncEmployeeChannel {
	type: 'sync-employee-channel';
	channelId: string;
	employeeUserId: string;
	viewerRoleIds: string[];
}

/** Stop these roles' own permissions in the channel, keeping everything else as it is. */
export interface RevokeChannelAccess {
	type: 'revoke-channel-access';
	channelId: string;
	roleIds: string[];
}

export interface RenameChannel {
	type: 'rename-channel';
	channelId: string;
	name: string;
}

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

/** A Job's Review Channel that gets a review copy of a round. */
export interface ReviewChannel {
	jobId: number;
	channelId: string;
}

/**
 * Post a round of a request, re-uploading the files to each message: first its entry in the Employee's current Requests Thread
 * (reopening it if archived), then a review copy in each Review Channel linking to that entry.
 * Report the posted messages back through a `RoundRecorder` with `recordRound`.
 */
export interface PostRound {
	type: 'post-round';
	requestNumber: number;
	round: number;
	employeeUserId: string;
	entryCard: Card;
	actions: EntryAction[];
	reviewCard: Card;
	reviewChannels: ReviewChannel[];
	files: EvidenceFile[];
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

/** Show a Payout privately to the actor, with Mark paid and Discard buttons when `settleButtons` is set. */
export interface ShowPayout {
	type: 'show-payout';
	payoutNumber: number;
	/** The version shown, which the Mark paid and Discard buttons carry. */
	revision: number;
	card: Card;
	settleButtons: boolean;
}

export type PayoutAction =
	| { kind: 'generate'; employeeUserId: string; label: string }
	| { kind: 'show'; payoutNumber: number; label: string }
	| { kind: 'disbursement'; disbursementNumber: number; label: string };

/** Show the payouts view privately to the actor, with one button per action. */
export interface ShowPayouts {
	type: 'show-payouts';
	card: Card;
	actions: PayoutAction[];
}

/** What the viewer of a Project can do to it with a button. */
export type ProjectAction = 'share' | 'change-share' | 'fund' | 'close';

/** Show a Project privately to the actor, with one button per action. */
export interface ShowProject {
	type: 'show-project';
	projectId: number;
	card: Card;
	actions: ProjectAction[];
}

/** A Project the actor can pick to open. */
export interface ProjectChoice {
	id: number;
	label: string;
}

/** Show the Projects privately to the actor, with a menu to open one and, when `canCreate` is set, a button to create one. */
export interface ShowProjects {
	type: 'show-projects';
	card: Card;
	projects: ProjectChoice[];
	canCreate: boolean;
}

/** Something Leadership can open from a management view's menu. */
export interface Choice {
	id: number;
	label: string;
}

export type JobAction = 'edit' | 'managers' | 'retire';
export type TaskAction = 'edit' | 'jobs' | 'retire' | 'restore';
export type SpendingCategoryAction = 'edit' | 'target' | 'retire' | 'restore';

/** What a management view offers below its card. */
export type ManageView =
	| { kind: 'jobs'; jobs: Choice[] }
	| { kind: 'job'; jobId: number; actions: JobAction[] }
	| { kind: 'tasks'; jobs: Choice[] }
	| { kind: 'job-tasks'; jobId: number; tasks: Choice[]; canAdd: boolean }
	| { kind: 'task'; taskId: number; actions: TaskAction[] }
	| { kind: 'spending-categories'; categories: Choice[] }
	| { kind: 'spending-category'; spendingCategoryId: number; actions: SpendingCategoryAction[] };

/** Show a Job or Task management view privately to the actor, with the menus and buttons the view offers. */
export interface ShowManage {
	type: 'show-manage';
	card: Card;
	view: ManageView;
}
