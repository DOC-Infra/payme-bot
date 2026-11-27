import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { DisbursementState, PayoutState, ProjectState, RequestState } from '../core/labels';

const requestStates = ['pending', 'approved', 'rejected', 'denied', 'withdrawn', 'paid'] as const satisfies readonly RequestState[];
const payoutStates = ['open', 'paid', 'discarded'] as const satisfies readonly PayoutState[];
const projectStates = ['open', 'closed'] as const satisfies readonly ProjectState[];
const disbursementStates = ['requested', 'paid', 'declined', 'withdrawn', 'voided'] as const satisfies readonly DisbursementState[];

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const jobs = sqliteTable('jobs', {
	id: integer('id').primaryKey(),
	name: text('name').notNull().unique(),
	employeeRoleId: text('employee_role_id').notNull(),
	reviewChannelId: text('review_channel_id').notNull(),
	retired: integer('retired', { mode: 'boolean' }).notNull().default(false)
});

export const jobManagerRoles = sqliteTable(
	'job_manager_roles',
	{
		jobId: integer('job_id')
			.notNull()
			.references(() => jobs.id),
		roleId: text('role_id').notNull()
	},
	(table) => [primaryKey({ columns: [table.jobId, table.roleId] })]
);

export const tasks = sqliteTable('tasks', {
	id: integer('id').primaryKey(),
	name: text('name').notNull().unique(),
	rate: integer('rate').notNull(),
	retired: integer('retired', { mode: 'boolean' }).notNull().default(false),
	evidenceRequired: integer('evidence_required', { mode: 'boolean' }).notNull().default(true),
	notesRequired: integer('notes_required', { mode: 'boolean' }).notNull().default(true)
});

export const taskJobs = sqliteTable(
	'task_jobs',
	{
		taskId: integer('task_id')
			.notNull()
			.references(() => tasks.id),
		jobId: integer('job_id')
			.notNull()
			.references(() => jobs.id)
	},
	(table) => [primaryKey({ columns: [table.taskId, table.jobId] })]
);

export const employees = sqliteTable('employees', {
	userId: text('user_id').primaryKey(),
	minecraftName: text('minecraft_name').notNull(),
	channelId: text('channel_id').unique(),
	threadId: text('thread_id'),
	pinnedMessageId: text('pinned_message_id')
});

export const paymentRequests = sqliteTable('payment_requests', {
	number: integer('number').primaryKey(),
	employeeUserId: text('employee_user_id')
		.notNull()
		.references(() => employees.userId),
	taskId: integer('task_id')
		.notNull()
		.references(() => tasks.id),
	state: text('state', { enum: requestStates }).notNull(),
	round: integer('round').notNull().default(1),
	ticket: text('ticket')
});

export const paymentRequestJobs = sqliteTable(
	'payment_request_jobs',
	{
		requestNumber: integer('request_number')
			.notNull()
			.references(() => paymentRequests.number),
		jobId: integer('job_id')
			.notNull()
			.references(() => jobs.id)
	},
	(table) => [primaryKey({ columns: [table.requestNumber, table.jobId] })]
);

export const paymentRequestEvidence = sqliteTable('payment_request_evidence', {
	id: integer('id').primaryKey(),
	requestNumber: integer('request_number')
		.notNull()
		.references(() => paymentRequests.number),
	round: integer('round').notNull(),
	kind: text('kind', { enum: ['notes', 'link', 'attachment'] }).notNull(),
	value: text('value').notNull(),
	name: text('name')
});

export const paymentRequestHistory = sqliteTable('payment_request_history', {
	id: integer('id').primaryKey(),
	requestNumber: integer('request_number')
		.notNull()
		.references(() => paymentRequests.number),
	fromState: text('from_state', { enum: requestStates }),
	toState: text('to_state', { enum: requestStates }).notNull(),
	actorUserId: text('actor_user_id').notNull(),
	reason: text('reason'),
	at: text('at').notNull().default(now)
});

export const paymentRequestMessages = sqliteTable('payment_request_messages', {
	messageId: text('message_id').primaryKey(),
	requestNumber: integer('request_number')
		.notNull()
		.references(() => paymentRequests.number),
	round: integer('round').notNull(),
	jobId: integer('job_id').references(() => jobs.id),
	channelId: text('channel_id').notNull()
});

export const payouts = sqliteTable('payouts', {
	number: integer('number').primaryKey(),
	employeeUserId: text('employee_user_id')
		.notNull()
		.references(() => employees.userId),
	minecraftName: text('minecraft_name').notNull(),
	total: integer('total').notNull(),
	state: text('state', { enum: payoutStates }).notNull(),
	/** Goes up each time the Open Payout is updated, so a message showing an older version can't settle it. */
	revision: integer('revision').notNull().default(1),
	generatedBy: text('generated_by').notNull(),
	generatedAt: text('generated_at').notNull().default(now),
	settledBy: text('settled_by'),
	settledAt: text('settled_at')
});

export const payoutLines = sqliteTable(
	'payout_lines',
	{
		payoutNumber: integer('payout_number')
			.notNull()
			.references(() => payouts.number),
		requestNumber: integer('request_number')
			.notNull()
			.references(() => paymentRequests.number),
		taskId: integer('task_id')
			.notNull()
			.references(() => tasks.id),
		jobId: integer('job_id')
			.notNull()
			.references(() => jobs.id),
		rate: integer('rate').notNull()
	},
	(table) => [primaryKey({ columns: [table.payoutNumber, table.requestNumber] })]
);

export const projects = sqliteTable('projects', {
	id: integer('id').primaryKey(),
	name: text('name').notNull().unique(),
	jobId: integer('job_id')
		.notNull()
		.references(() => jobs.id),
	state: text('state', { enum: projectStates }).notNull(),
	createdBy: text('created_by').notNull()
});

export const projectFunding = sqliteTable('project_funding', {
	id: integer('id').primaryKey(),
	projectId: integer('project_id')
		.notNull()
		.references(() => projects.id),
	amount: integer('amount').notNull(),
	actorUserId: text('actor_user_id').notNull(),
	at: text('at').notNull().default(now)
});

export const projectShares = sqliteTable('project_shares', {
	id: integer('id').primaryKey(),
	projectId: integer('project_id')
		.notNull()
		.references(() => projects.id),
	employeeUserId: text('employee_user_id')
		.notNull()
		.references(() => employees.userId),
	amount: integer('amount').notNull(),
	note: text('note'),
	actorUserId: text('actor_user_id').notNull(),
	paid: integer('paid', { mode: 'boolean' }).notNull().default(false),
	removed: integer('removed', { mode: 'boolean' }).notNull().default(false),
	at: text('at').notNull().default(now)
});

export const payoutShareLines = sqliteTable(
	'payout_share_lines',
	{
		payoutNumber: integer('payout_number')
			.notNull()
			.references(() => payouts.number),
		shareId: integer('share_id')
			.notNull()
			.references(() => projectShares.id),
		projectId: integer('project_id')
			.notNull()
			.references(() => projects.id),
		jobId: integer('job_id')
			.notNull()
			.references(() => jobs.id),
		amount: integer('amount').notNull()
	},
	(table) => [primaryKey({ columns: [table.payoutNumber, table.shareId] })]
);

/** Each time Leadership sets the Appropriation: `amount` applies from `fromMonth` (YYYY-MM) until a later month is set. */
export const appropriations = sqliteTable('appropriations', {
	id: integer('id').primaryKey(),
	fromMonth: text('from_month').notNull(),
	amount: integer('amount').notNull(),
	actorUserId: text('actor_user_id').notNull(),
	at: text('at').notNull().default(now)
});

/** Employee Pay is the one built-in row, added by its migration. */
export const spendingCategories = sqliteTable('spending_categories', {
	id: integer('id').primaryKey(),
	name: text('name').notNull().unique(),
	builtIn: integer('built_in', { mode: 'boolean' }).notNull().default(false),
	retired: integer('retired', { mode: 'boolean' }).notNull().default(false)
});

/** The Jobs whose Employees and Managers may request Disbursements from a Spending Category. */
export const spendingCategoryJobs = sqliteTable(
	'spending_category_jobs',
	{
		categoryId: integer('category_id')
			.notNull()
			.references(() => spendingCategories.id),
		jobId: integer('job_id')
			.notNull()
			.references(() => jobs.id)
	},
	(table) => [primaryKey({ columns: [table.categoryId, table.jobId] })]
);

/** Each time Leadership sets a Spending Category's target: `percent` (hundredths of a percent, null for none) applies from `fromMonth`. */
export const spendingCategoryTargets = sqliteTable('spending_category_targets', {
	id: integer('id').primaryKey(),
	categoryId: integer('category_id')
		.notNull()
		.references(() => spendingCategories.id),
	fromMonth: text('from_month').notNull(),
	percent: integer('percent'),
	actorUserId: text('actor_user_id').notNull(),
	at: text('at').notNull().default(now)
});

/** `jobId` is null when Leadership requested it without holding one of the Category's Jobs. */
export const disbursements = sqliteTable('disbursements', {
	number: integer('number').primaryKey(),
	categoryId: integer('category_id')
		.notNull()
		.references(() => spendingCategories.id),
	jobId: integer('job_id').references(() => jobs.id),
	recipient: text('recipient').notNull(),
	amount: integer('amount').notNull(),
	reason: text('reason').notNull(),
	link: text('link'),
	state: text('state', { enum: disbursementStates }).notNull(),
	requestedBy: text('requested_by').notNull(),
	requestedAt: text('requested_at').notNull().default(now),
	settledBy: text('settled_by'),
	settledAt: text('settled_at'),
	/** Why it was Declined or Voided. */
	outcomeReason: text('outcome_reason'),
	/** The public card, once posted. */
	channelId: text('channel_id'),
	messageId: text('message_id')
});

/** One value per key, for things Leadership sets from Discord, like the Rates Channel. */
export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});
