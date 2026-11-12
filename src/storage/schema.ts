import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { PayoutState, RequestState } from '../core/labels';

const requestStates = ['pending', 'approved', 'rejected', 'denied', 'withdrawn', 'paid'] as const satisfies readonly RequestState[];
const payoutStates = ['open', 'paid', 'discarded'] as const satisfies readonly PayoutState[];

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
