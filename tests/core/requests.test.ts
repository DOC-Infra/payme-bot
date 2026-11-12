import { describe, expect, it } from 'vitest';
import {
	addManagerRole,
	addTask,
	addTaskToJob,
	claimTicket,
	createJob,
	hireEmployee,
	recordRequestsThread,
	requestEntry,
	requestForm,
	retireTask,
	submitRequest,
	ticketTaskName,
	withdrawRequest,
	type Actor,
	type Outcome,
	type PayMe,
	type RequestForm
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const screenshot = { name: 'proof.png', url: 'https://cdn.example/proof.png' };

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

function taskForm(outcome: Outcome<RequestForm>) {
	const form = created(outcome);
	if (form.kind !== 'tasks') throw new Error('Expected a form of Tasks, got a Job choice');
	return form;
}

function taskNames(outcome: Outcome<RequestForm>): string[] {
	return taskForm(outcome).tasks.map((offered) => offered.name);
}

function jobChoice(outcome: Outcome<RequestForm>): string[] {
	const form = created(outcome);
	if (form.kind !== 'jobs') throw new Error('Expected a Job choice, got a form of Tasks');
	return form.jobs.map((offered) => offered.name);
}

function job(payMe: PayMe, name: string) {
	const slug = name.toLowerCase();
	const result = created(createJob(payMe, leadership(), { name, employeeRoleId: `role-${slug}`, reviewChannelId: `review-${slug}` }));
	addManagerRole(payMe, leadership(), result.id, `role-${slug}-manager`, []);
	return result;
}

function task(payMe: PayMe, name: string, ...jobIds: number[]) {
	return created(addTask(payMe, leadership(), { name, rate: '100', jobIds }));
}

function hire(payMe: PayMe, userId: string) {
	created(hireEmployee(payMe, leadership(), member(userId), 'Alex_42'));
	recordRequestsThread(payMe, userId, { channelId: `channel-${userId}`, pinnedMessageId: `pin-${userId}`, threadId: `thread-${userId}` });
}

function submit(payMe: PayMe, actor: Actor, taskId: number) {
	return created(submitRequest(payMe, actor, { taskId, notes: 'Done', link: null, files: [screenshot] }));
}

describe('Opening the request form', () => {
	it('tells a member who has not been hired to ask Leadership to hire them', () => {
		const payMe = createTestPayMe();

		expect(requestForm(payMe, member('user-alex', 'role-courier'))).toEqual({ ok: false, error: { code: 'not-hired' } });
	});

	it('tells an Employee with no Jobs that they have none', () => {
		const payMe = createTestPayMe();
		task(payMe, 'Deliver Parcel', job(payMe, 'Courier').id);
		hire(payMe, 'user-alex');

		expect(requestForm(payMe, member('user-alex', 'role-unrelated'))).toEqual({ ok: false, error: { code: 'no-jobs' } });
	});

	it("offers only active Tasks from the Employee's current Jobs, by name", () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const miner = job(payMe, 'Miner');
		const logistics = job(payMe, 'Logistics');
		task(payMe, 'Mine Ore', miner.id);
		task(payMe, 'Deliver Parcel', courier.id);
		task(payMe, 'Load Cart', courier.id, logistics.id);
		task(payMe, 'Stack Crates', logistics.id);
		retireTask(payMe, leadership(), task(payMe, 'Old Route', courier.id).id);
		hire(payMe, 'user-alex');

		const form = taskNames(requestForm(payMe, member('user-alex', 'role-courier', 'role-logistics')));

		expect(form).toEqual(['Deliver Parcel', 'Load Cart', 'Stack Crates']);
	});

	describe('when the Employee holds Jobs with more than 25 active Tasks between them', () => {
		function twoFullJobs() {
			const payMe = createTestPayMe();
			const courier = job(payMe, 'Courier');
			const miner = job(payMe, 'Miner');
			for (let i = 10; i < 30; i++) {
				task(payMe, `Courier Task ${i}`, courier.id);
				task(payMe, `Miner Task ${i}`, miner.id);
			}
			const outside = task(payMe, 'Stack Crates', job(payMe, 'Logistics').id);
			hire(payMe, 'user-alex');
			return { payMe, miner, outside, alex: member('user-alex', 'role-courier', 'role-miner') };
		}

		it('asks them to pick one of their Jobs instead of showing a form', () => {
			const { payMe, alex } = twoFullJobs();

			expect(jobChoice(requestForm(payMe, alex))).toEqual(['Courier', 'Miner']);
		});

		it('asks Leadership filing on their behalf to pick a Job too', () => {
			const { payMe, alex } = twoFullJobs();

			expect(jobChoice(requestForm(payMe, leadership(), null, alex))).toEqual(['Courier', 'Miner']);
		});

		it('shows a Manager filing on their behalf the form when the Jobs they manage fit on it', () => {
			const { payMe, alex } = twoFullJobs();

			expect(taskNames(requestForm(payMe, member('user-sam', 'role-miner-manager'), null, alex))).toHaveLength(20);
		});

		it("offers only the picked Job's active Tasks", () => {
			const { payMe, miner, alex } = twoFullJobs();

			const form = taskNames(requestForm(payMe, alex, miner.id));

			expect(form).toHaveLength(20);
			expect(form.every((name) => name.startsWith('Miner Task'))).toBe(true);
		});

		it('refuses a Job they do not hold', () => {
			const { payMe, alex } = twoFullJobs();
			const warehouse = job(payMe, 'Warehouse');

			expect(requestForm(payMe, alex, warehouse.id)).toEqual({ ok: false, error: { code: 'job-not-held' } });
		});

		it('accepts any active Task of their Jobs on submission, and no other', () => {
			const { payMe, miner, outside, alex } = twoFullJobs();
			const minerTask = taskForm(requestForm(payMe, alex, miner.id)).tasks[19];
			const evidence = { notes: 'Done', link: null, files: [screenshot] };

			expect(submitRequest(payMe, alex, { taskId: minerTask.id, ...evidence })).toMatchObject({ ok: true, value: { taskId: minerTask.id } });
			expect(submitRequest(payMe, alex, { taskId: outside.id, ...evidence })).toEqual({ ok: false, error: { code: 'task-not-offered' } });
		});
	});

	it('shows the form with exactly 25 Tasks, and asks for a Job at 26', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const miner = job(payMe, 'Miner');
		for (let i = 10; i < 35; i++) task(payMe, `Courier Task ${i}`, courier.id);
		hire(payMe, 'user-alex');
		const alex = member('user-alex', 'role-courier', 'role-miner');

		expect(taskNames(requestForm(payMe, alex))).toHaveLength(25);
		task(payMe, 'Mine Ore', miner.id);
		expect(jobChoice(requestForm(payMe, alex))).toEqual(['Courier', 'Miner']);
	});

	it('lists at most 25 Jobs to pick from', () => {
		const payMe = createTestPayMe();
		const roles: string[] = [];
		for (let i = 10; i < 40; i++) {
			const held = job(payMe, `Job ${i}`);
			task(payMe, `Task ${i}`, held.id);
			roles.push(`role-job ${i}`);
		}
		hire(payMe, 'user-alex');

		expect(jobChoice(requestForm(payMe, member('user-alex', ...roles)))).toHaveLength(25);
	});

	it("offers only a picked Job's Tasks when the Employee has 25 or fewer in total", () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const logistics = job(payMe, 'Logistics');
		task(payMe, 'Deliver Parcel', courier.id);
		task(payMe, 'Stack Crates', logistics.id);
		hire(payMe, 'user-alex');

		const form = taskNames(requestForm(payMe, member('user-alex', 'role-courier', 'role-logistics'), logistics.id));

		expect(form).toEqual(['Stack Crates']);
	});

	describe("hints at each Task's Evidence and notes requirements", () => {
		function courierWith(...tasks: { name: string; evidenceRequired: boolean; notesRequired: boolean }[]) {
			const payMe = createTestPayMe();
			const courier = job(payMe, 'Courier');
			for (const input of tasks) created(addTask(payMe, leadership(), { ...input, rate: '12.5', jobIds: [courier.id] }));
			hire(payMe, 'user-alex');
			return taskForm(requestForm(payMe, member('user-alex', 'role-courier')));
		}

		it('requires notes and a link or file when every Task does', () => {
			const form = courierWith({ name: 'Deliver Parcel', evidenceRequired: true, notesRequired: true });

			expect(form).toMatchObject({
				tasks: [{ name: 'Deliver Parcel', description: 'Rate 12.5' }],
				notesRequired: true,
				notesHint: 'What did you do?',
				linkHint: 'Optional. A link or a file is required.',
				filesHint: 'Optional screenshots. A link or a file is required.'
			});
		});

		it('leaves notes optional and names the exemptions on each Task when only some Tasks need them', () => {
			const form = courierWith(
				{ name: 'Deliver Parcel', evidenceRequired: true, notesRequired: true },
				{ name: 'Scan Crate', evidenceRequired: false, notesRequired: false }
			);

			expect(form).toMatchObject({
				tasks: [
					{ name: 'Deliver Parcel', description: 'Rate 12.5' },
					{ name: 'Scan Crate', description: 'Rate 12.5, no link or file needed, no notes needed' }
				],
				notesRequired: false,
				notesHint: 'What did you do? Required unless the Task says otherwise.',
				linkHint: 'Optional. A link or a file is required unless the Task says otherwise.',
				filesHint: 'Optional screenshots. A link or a file is required unless the Task says otherwise.'
			});
		});

		it('says notes are optional when no Task needs them', () => {
			const form = courierWith({ name: 'Attend Meeting', evidenceRequired: true, notesRequired: false });

			expect(form).toMatchObject({ notesRequired: false, notesHint: 'What did you do? Optional.' });
		});
	});

	it('tells an Employee whose Jobs have no active Tasks that there is nothing to request', () => {
		const payMe = createTestPayMe();
		job(payMe, 'Courier');
		hire(payMe, 'user-alex');

		expect(requestForm(payMe, member('user-alex', 'role-courier'))).toEqual({ ok: false, error: { code: 'no-tasks' } });
	});
});

describe('Submitting a Payment Request', () => {
	it('numbers the request R-n and records it as Pending with its Evidence and history', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const parcel = task(payMe, 'Deliver Parcel', courier.id);
		hire(payMe, 'user-alex');
		const alex = member('user-alex', 'role-courier');

		const first = created(submitRequest(payMe, alex, { taskId: parcel.id, notes: 'Took it to spawn', link: null, files: [screenshot] }));
		const second = created(submitRequest(payMe, alex, { taskId: parcel.id, notes: 'Again', link: 'https://example.com/proof', files: [] }));

		expect([first.number, second.number]).toEqual([1, 2]);
		expect(payMe.requests.load(1)).toMatchObject({
			number: 1,
			employeeUserId: 'user-alex',
			taskId: parcel.id,
			state: 'pending',
			round: 1,
			eligibleJobIds: [courier.id],
			evidence: [
				{ round: 1, kind: 'notes', text: 'Took it to spawn' },
				{ round: 1, kind: 'attachment', name: 'proof.png', url: 'https://cdn.example/proof.png' }
			],
			history: [{ from: null, to: 'pending', actorUserId: 'user-alex', reason: null }],
			messages: []
		});
		expect(payMe.requests.load(2)?.evidence).toEqual([
			{ round: 1, kind: 'notes', text: 'Again' },
			{ round: 1, kind: 'link', url: 'https://example.com/proof' }
		]);
	});

	it('posts the request with its Evidence to the Requests Thread, then a review copy to each eligible Review Channel', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const logistics = job(payMe, 'Logistics');
		const cart = task(payMe, 'Load Cart', courier.id, logistics.id);
		hire(payMe, 'user-alex');
		const files = [screenshot, { name: 'map.jpg', url: 'https://cdn.example/map.jpg' }];

		const outcome = submitRequest(payMe, member('user-alex', 'role-courier', 'role-logistics'), {
			taskId: cart.id,
			notes: 'Loaded 64 crates',
			link: 'https://example.com/proof',
			files
		});

		const fields = [
			{ name: 'Notes', value: 'Loaded 64 crates' },
			{ name: 'Link', value: 'https://example.com/proof' }
		];
		const review = (jobId: number, channelId: string) => ({
			type: 'post-review-message',
			requestNumber: 1,
			round: 1,
			jobId,
			channelId,
			card: { tone: 'info', title: 'R-1 · Load Cart', description: 'From <@user-alex> (Alex_42)', fields, footer: undefined },
			files
		});
		expect(outcome.ok && outcome.effects).toEqual([
			{
				type: 'post-request-entry',
				requestNumber: 1,
				round: 1,
				employeeUserId: 'user-alex',
				card: {
					tone: 'info',
					title: 'R-1 · Load Cart',
					description: 'Submitted by <@user-alex>, Pending review.',
					fields,
					footer: undefined
				},
				files,
				actions: ['withdraw']
			},
			review(courier.id, 'review-courier'),
			review(logistics.id, 'review-logistics'),
			{ type: 'private-reply', card: { tone: 'success', description: 'Submitted R-1 for Load Cart.' } }
		]);
	});

	it('records the Requests Thread entry and each review copy once Discord has posted them', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		hire(payMe, 'user-alex');
		submit(payMe, member('user-alex', 'role-courier'), task(payMe, 'Deliver Parcel', courier.id).id);

		payMe.requests.recordMessage(1, { round: 1, jobId: null, channelId: 'thread-user-alex', messageId: 'message-entry' });
		payMe.requests.recordMessage(1, { round: 1, jobId: courier.id, channelId: 'review-courier', messageId: 'message-review' });

		expect(payMe.requests.load(1)?.messages).toEqual([
			{ round: 1, jobId: null, channelId: 'thread-user-alex', messageId: 'message-entry' },
			{ round: 1, jobId: courier.id, channelId: 'review-courier', messageId: 'message-review' }
		]);
		expect(requestEntry(payMe, 1, 1)).toEqual({ round: 1, jobId: null, channelId: 'thread-user-alex', messageId: 'message-entry' });
	});

	it("refuses until the Employee's Requests Thread exists", () => {
		const payMe = createTestPayMe();
		const parcel = task(payMe, 'Deliver Parcel', job(payMe, 'Courier').id);
		created(hireEmployee(payMe, leadership(), member('user-alex'), 'Alex_42'));

		expect(requestForm(payMe, member('user-alex', 'role-courier'))).toEqual({ ok: false, error: { code: 'no-requests-thread' } });
		expect(
			submitRequest(payMe, member('user-alex', 'role-courier'), { taskId: parcel.id, notes: 'Done', link: null, files: [screenshot] })
		).toEqual({
			ok: false,
			error: { code: 'no-requests-thread' }
		});
	});

	it('fixes the eligible Jobs at submission: the Jobs the Task belongs to that the Employee holds', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const logistics = job(payMe, 'Logistics');
		const miner = job(payMe, 'Miner');
		const cart = task(payMe, 'Load Cart', courier.id, logistics.id, miner.id);
		hire(payMe, 'user-alex');

		submit(payMe, member('user-alex', 'role-courier', 'role-miner'), cart.id);
		addTaskToJob(payMe, leadership(), cart.id, job(payMe, 'Farmer').id);
		submit(payMe, member('user-alex', 'role-logistics', 'role-farmer'), cart.id);

		expect(payMe.requests.load(1)?.eligibleJobIds).toEqual([courier.id, miner.id]);
	});

	it('refuses a submission with neither a link nor a file', () => {
		const payMe = createTestPayMe();
		const parcel = task(payMe, 'Deliver Parcel', job(payMe, 'Courier').id);
		hire(payMe, 'user-alex');

		expect(submitRequest(payMe, member('user-alex', 'role-courier'), { taskId: parcel.id, notes: 'Trust me', link: null, files: [] })).toEqual({
			ok: false,
			error: { code: 'evidence-required' }
		});
		expect(payMe.requests.load(1)).toBeNull();
	});

	it('accepts notes alone for a Task that needs no link or file', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const meeting = created(addTask(payMe, leadership(), { name: 'Attend meeting', rate: '5', evidenceRequired: false, jobIds: [courier.id] }));
		hire(payMe, 'user-alex');

		const request = created(
			submitRequest(payMe, member('user-alex', 'role-courier'), { taskId: meeting.id, notes: 'Was there', link: null, files: [] })
		);

		expect(request.evidence).toEqual([{ round: 1, kind: 'notes', text: 'Was there' }]);
	});

	it('accepts blank notes for a Task that needs no notes, recording no notes Evidence', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const scan = created(addTask(payMe, leadership(), { name: 'Scan crate', rate: '5', notesRequired: false, jobIds: [courier.id] }));
		hire(payMe, 'user-alex');

		const request = created(
			submitRequest(payMe, member('user-alex', 'role-courier'), { taskId: scan.id, notes: ' ', link: null, files: [screenshot] })
		);

		expect(request.evidence).toEqual([{ round: 1, kind: 'attachment', name: screenshot.name, url: screenshot.url }]);
	});

	it('refuses blank notes and a link that is not a web address', () => {
		const payMe = createTestPayMe();
		const parcel = task(payMe, 'Deliver Parcel', job(payMe, 'Courier').id);
		hire(payMe, 'user-alex');
		const alex = member('user-alex', 'role-courier');

		expect(submitRequest(payMe, alex, { taskId: parcel.id, notes: '  ', link: null, files: [screenshot] })).toEqual({
			ok: false,
			error: { code: 'notes-required' }
		});
		expect(submitRequest(payMe, alex, { taskId: parcel.id, notes: 'Done', link: 'javascript:alert(1)', files: [] })).toEqual({
			ok: false,
			error: { code: 'invalid-link', link: 'javascript:alert(1)' }
		});
	});

	it('refuses Tasks the Employee was not offered: retired, or outside their current Jobs', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const ore = task(payMe, 'Mine Ore', job(payMe, 'Miner').id);
		const oldRoute = task(payMe, 'Old Route', courier.id);
		retireTask(payMe, leadership(), oldRoute.id);
		hire(payMe, 'user-alex');
		const alex = member('user-alex', 'role-courier');

		for (const taskId of [ore.id, oldRoute.id, 999]) {
			expect(submitRequest(payMe, alex, { taskId, notes: 'Done', link: null, files: [screenshot] })).toEqual({
				ok: false,
				error: { code: 'task-not-offered' }
			});
		}
	});

	it('refuses members who have not been hired and Employees with no Jobs', () => {
		const payMe = createTestPayMe();
		const parcel = task(payMe, 'Deliver Parcel', job(payMe, 'Courier').id);
		hire(payMe, 'user-alex');
		const input = { taskId: parcel.id, notes: 'Done', link: null, files: [screenshot] };

		expect(submitRequest(payMe, member('user-sam', 'role-courier'), input)).toEqual({ ok: false, error: { code: 'not-hired' } });
		expect(submitRequest(payMe, member('user-alex'), input)).toEqual({ ok: false, error: { code: 'no-jobs' } });
	});
});

describe('Claiming a DOC ticket', () => {
	function ticketScenario() {
		const payMe = createTestPayMe();
		const support = job(payMe, 'Support');
		const assistance = task(payMe, ticketTaskName, support.id);
		hire(payMe, 'user-alex');
		return { payMe, assistance, alex: member('user-alex', 'role-support') };
	}

	it('submits a request for the DOC Ticket Assistance Task with the ticket number as its only Evidence', () => {
		const { payMe, assistance, alex } = ticketScenario();

		const request = created(claimTicket(payMe, alex, '01234'));

		expect(request.taskId).toBe(assistance.id);
		expect(request.state).toBe('pending');
		expect(request.evidence).toEqual([{ round: 1, kind: 'notes', text: 'Ticket 01234' }]);
	});

	it.each(['1234', '123456', '12a45', ''])('refuses %j, which is not 5 digits', (ticket) => {
		const { payMe, alex } = ticketScenario();

		expect(claimTicket(payMe, alex, ticket)).toEqual({ ok: false, error: { code: 'invalid-ticket', ticket } });
	});

	it('refuses a ticket the Employee already claimed, unless that request was withdrawn', () => {
		const { payMe, alex } = ticketScenario();
		created(claimTicket(payMe, alex, '55555'));

		expect(claimTicket(payMe, alex, '55555')).toEqual({ ok: false, error: { code: 'ticket-claimed', ticket: '55555' } });
		created(withdrawRequest(payMe, alex, 1));
		expect(created(claimTicket(payMe, alex, '55555')).number).toBe(2);
	});

	it('lets different Employees claim the same ticket', () => {
		const { payMe, alex } = ticketScenario();
		hire(payMe, 'user-sam');
		created(claimTicket(payMe, alex, '55555'));

		expect(created(claimTicket(payMe, member('user-sam', 'role-support'), '55555')).employeeUserId).toBe('user-sam');
	});

	it('explains when the Task does not exist or the Employee is not offered it', () => {
		const payMe = createTestPayMe();
		job(payMe, 'Courier');
		hire(payMe, 'user-alex');
		const alex = member('user-alex', 'role-courier');

		expect(claimTicket(payMe, alex, '12345')).toEqual({ ok: false, error: { code: 'no-ticket-task', name: ticketTaskName } });
		task(payMe, ticketTaskName, job(payMe, 'Support').id);
		expect(claimTicket(payMe, alex, '12345')).toEqual({ ok: false, error: { code: 'task-not-offered' } });
	});
});

describe('Requesting payment on behalf of an Employee', () => {
	function courierAndMiner() {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const miner = job(payMe, 'Miner');
		const parcel = task(payMe, 'Deliver Parcel', courier.id);
		const ore = task(payMe, 'Mine Ore', miner.id);
		const cart = task(payMe, 'Load Cart', courier.id, miner.id);
		hire(payMe, 'user-alex');
		const alex = member('user-alex', 'role-courier', 'role-miner');
		const courierManager = member('user-sam', 'role-courier-manager');
		return { payMe, courier, miner, parcel, ore, cart, alex, courierManager };
	}

	it('offers a Manager only the Tasks of Jobs they manage that the Employee holds', () => {
		const { payMe, alex, courierManager } = courierAndMiner();

		expect(taskNames(requestForm(payMe, courierManager, null, alex))).toEqual(['Deliver Parcel', 'Load Cart']);
	});

	it('offers Leadership the Tasks of every Job the Employee holds', () => {
		const { payMe, alex } = courierAndMiner();

		expect(taskNames(requestForm(payMe, leadership(), null, alex))).toEqual(['Deliver Parcel', 'Load Cart', 'Mine Ore']);
	});

	it('files the request for the Employee, recording the Manager as its submitter', () => {
		const { payMe, courier, miner, cart, alex, courierManager } = courierAndMiner();

		const outcome = submitRequest(payMe, courierManager, { taskId: cart.id, notes: 'Saw it done', link: null, files: [screenshot] }, alex);

		expect(outcome).toMatchObject({
			ok: true,
			value: {
				employeeUserId: 'user-alex',
				state: 'pending',
				eligibleJobIds: [courier.id, miner.id],
				history: [{ from: null, to: 'pending', actorUserId: 'user-sam', reason: null }]
			},
			effects: [
				{
					type: 'post-request-entry',
					employeeUserId: 'user-alex',
					card: { description: 'Submitted by <@user-sam> for <@user-alex>, Pending review.' }
				},
				{ type: 'post-review-message', jobId: courier.id },
				{ type: 'post-review-message', jobId: miner.id },
				{ type: 'private-reply', card: { description: 'Submitted R-1 for Load Cart on behalf of <@user-alex>.' } }
			]
		});
	});

	it("still requires the Task's Evidence", () => {
		const { payMe, parcel, alex, courierManager } = courierAndMiner();

		expect(submitRequest(payMe, courierManager, { taskId: parcel.id, notes: 'Saw it done', link: null, files: [] }, alex)).toEqual({
			ok: false,
			error: { code: 'evidence-required' }
		});
	});

	it('refuses a Task outside the Jobs the Manager manages', () => {
		const { payMe, ore, alex, courierManager } = courierAndMiner();

		expect(submitRequest(payMe, courierManager, { taskId: ore.id, notes: 'Done', link: null, files: [screenshot] }, alex)).toEqual({
			ok: false,
			error: { code: 'task-not-offered' }
		});
	});

	it("refuses a member who manages none of the Employee's Jobs", () => {
		const { payMe, alex } = courierAndMiner();
		job(payMe, 'Logistics');

		expect(requestForm(payMe, member('user-sam', 'role-logistics-manager'), null, alex)).toEqual({
			ok: false,
			error: { code: 'not-their-manager' }
		});
		expect(requestForm(payMe, member('user-bo', 'role-courier'), null, alex)).toEqual({ ok: false, error: { code: 'not-their-manager' } });
	});

	it('refuses a picked Job the Manager does not manage', () => {
		const { payMe, miner, alex, courierManager } = courierAndMiner();

		expect(requestForm(payMe, courierManager, miner.id, alex)).toEqual({ ok: false, error: { code: 'not-their-manager' } });
	});

	it('says when the member is not an Employee or has no Requests Thread', () => {
		const { payMe, courierManager } = courierAndMiner();
		created(hireEmployee(payMe, leadership(), member('user-jo'), 'Jo_7'));

		expect(requestForm(payMe, courierManager, null, member('user-kim', 'role-courier'))).toEqual({
			ok: false,
			error: { code: 'employee-not-found' }
		});
		expect(requestForm(payMe, courierManager, null, member('user-jo', 'role-courier'))).toEqual({
			ok: false,
			error: { code: 'employee-no-requests-thread' }
		});
	});
});
