import { describe, expect, it } from 'vitest';
import {
	activeTasksForJobs,
	addTask,
	addTaskToJob,
	changeRate,
	createJob,
	formatAmount,
	getTask,
	listTasks,
	removeTaskFromJob,
	retireJob,
	retireTask,
	type Outcome,
	type PayMe,
	type Task
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const courier = { name: 'Courier', employeeRoleId: 'role-courier', reviewChannelId: 'channel-courier-review' };
const miner = { name: 'Miner', employeeRoleId: 'role-miner', reviewChannelId: 'channel-miner-review' };
const builder = { name: 'Builder', employeeRoleId: 'role-builder', reviewChannelId: 'channel-builder-review' };

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

function addTasks(payMe: PayMe, count: number, jobIds: number[]): Task[] {
	return Array.from({ length: count }, (_, i) => created(addTask(payMe, leadership(), { name: `Task ${i + 1}`, rate: '1', jobIds })));
}

describe('Amounts', () => {
	it.each([
		[150000, '1500'],
		[150050, '1500.5'],
		[150025, '1500.25'],
		[123456789, '1234567.89'],
		[5, '0.05'],
		[0, '0']
	])('formats %i hundredths as %s', (hundredths, text) => {
		expect(formatAmount(hundredths)).toBe(text);
	});
});

describe('Tasks', () => {
	it('lets Leadership add a Task with a name, a Rate and a Job', () => {
		const payMe = createTestPayMe();
		const job = created(createJob(payMe, leadership(), courier));

		const task = created(addTask(payMe, leadership(), { name: 'Deliver parcel', rate: '12.5', jobIds: [job.id] }));

		expect(getTask(payMe, task.id)).toEqual({ id: task.id, name: 'Deliver parcel', rate: 1250, jobIds: [job.id], retired: false });
	});

	it.each([
		['1500', 150000],
		['0.1', 10],
		['0.29', 29],
		['19.99', 1999],
		[' 7.05 ', 705]
	])('stores the Rate %s exactly', (rate, hundredths) => {
		const payMe = createTestPayMe();
		const job = created(createJob(payMe, leadership(), courier));

		const task = created(addTask(payMe, leadership(), { name: 'Deliver parcel', rate, jobIds: [job.id] }));

		expect(getTask(payMe, task.id)?.rate).toBe(hundredths);
	});

	it('lets a Task belong to several Jobs', () => {
		const payMe = createTestPayMe();
		const courierJob = created(createJob(payMe, leadership(), courier));
		const minerJob = created(createJob(payMe, leadership(), miner));

		const task = created(addTask(payMe, leadership(), { name: 'Haul ore', rate: '3', jobIds: [minerJob.id, courierJob.id] }));

		expect(getTask(payMe, task.id)?.jobIds).toEqual([courierJob.id, minerJob.id]);
	});

	it('refuses a Task with no Jobs', () => {
		const payMe = createTestPayMe();

		expect(addTask(payMe, leadership(), { name: 'Deliver parcel', rate: '5', jobIds: [] })).toEqual({
			ok: false,
			error: { code: 'task-needs-a-job' }
		});
	});

	it('refuses a Task for a Job that does not exist or is retired', () => {
		const payMe = createTestPayMe();
		const job = created(createJob(payMe, leadership(), courier));
		retireJob(payMe, leadership(), job.id);

		expect(addTask(payMe, leadership(), { name: 'Deliver parcel', rate: '5', jobIds: [99] })).toEqual({
			ok: false,
			error: { code: 'job-not-found' }
		});
		expect(addTask(payMe, leadership(), { name: 'Deliver parcel', rate: '5', jobIds: [job.id] })).toEqual({
			ok: false,
			error: { code: 'job-retired', name: 'Courier' }
		});
	});

	it('refuses a Task whose name is already taken, ignoring case', () => {
		const payMe = createTestPayMe();
		const job = created(createJob(payMe, leadership(), courier));
		addTask(payMe, leadership(), { name: 'Deliver parcel', rate: '5', jobIds: [job.id] });

		expect(addTask(payMe, leadership(), { name: 'deliver PARCEL', rate: '5', jobIds: [job.id] })).toEqual({
			ok: false,
			error: { code: 'task-name-taken', name: 'deliver PARCEL' }
		});
	});

	it('refuses a 26th active Task for a Job, naming the Job', () => {
		const payMe = createTestPayMe();
		const courierJob = created(createJob(payMe, leadership(), courier));
		const minerJob = created(createJob(payMe, leadership(), miner));
		addTasks(payMe, 25, [courierJob.id]);

		expect(addTask(payMe, leadership(), { name: 'One too many', rate: '1', jobIds: [minerJob.id, courierJob.id] })).toEqual({
			ok: false,
			error: { code: 'too-many-tasks', job: 'Courier' }
		});
		expect(addTask(payMe, leadership(), { name: 'Mine only', rate: '1', jobIds: [minerJob.id] })).toMatchObject({ ok: true });
	});

	it('does not count retired Tasks towards the 25-Task limit', () => {
		const payMe = createTestPayMe();
		const job = created(createJob(payMe, leadership(), courier));
		const [first] = addTasks(payMe, 25, [job.id]);
		retireTask(payMe, leadership(), first.id);

		expect(addTask(payMe, leadership(), { name: 'Replacement', rate: '1', jobIds: [job.id] })).toMatchObject({ ok: true });
	});

	it("lets Leadership change a Task's Rate, refusing an invalid one", () => {
		const payMe = createTestPayMe();
		const job = created(createJob(payMe, leadership(), courier));
		const task = created(addTask(payMe, leadership(), { name: 'Deliver parcel', rate: '5', jobIds: [job.id] }));

		expect(changeRate(payMe, leadership(), task.id, '7.25')).toMatchObject({ ok: true, value: { rate: 725 } });
		expect(changeRate(payMe, leadership(), task.id, '$8')).toEqual({ ok: false, error: { code: 'invalid-rate', rate: '$8' } });
		expect(getTask(payMe, task.id)?.rate).toBe(725);
	});

	it('lets Leadership add a Task to another Job and remove it from one', () => {
		const payMe = createTestPayMe();
		const courierJob = created(createJob(payMe, leadership(), courier));
		const minerJob = created(createJob(payMe, leadership(), miner));
		const task = created(addTask(payMe, leadership(), { name: 'Haul ore', rate: '3', jobIds: [courierJob.id] }));

		expect(addTaskToJob(payMe, leadership(), task.id, minerJob.id)).toMatchObject({ ok: true, value: { jobIds: [courierJob.id, minerJob.id] } });
		expect(removeTaskFromJob(payMe, leadership(), task.id, courierJob.id)).toMatchObject({ ok: true, value: { jobIds: [minerJob.id] } });
	});

	it('refuses removing a Task from its only Job', () => {
		const payMe = createTestPayMe();
		const job = created(createJob(payMe, leadership(), courier));
		const task = created(addTask(payMe, leadership(), { name: 'Deliver parcel', rate: '5', jobIds: [job.id] }));

		expect(removeTaskFromJob(payMe, leadership(), task.id, job.id)).toEqual({ ok: false, error: { code: 'task-needs-a-job' } });
	});

	it('refuses adding an active Task to a Job that already has 25 active Tasks', () => {
		const payMe = createTestPayMe();
		const courierJob = created(createJob(payMe, leadership(), courier));
		const minerJob = created(createJob(payMe, leadership(), miner));
		const [first] = addTasks(payMe, 25, [courierJob.id]);
		const task = created(addTask(payMe, leadership(), { name: 'Haul ore', rate: '3', jobIds: [minerJob.id] }));

		expect(addTaskToJob(payMe, leadership(), task.id, courierJob.id)).toEqual({
			ok: false,
			error: { code: 'too-many-tasks', job: 'Courier' }
		});
		expect(addTaskToJob(payMe, leadership(), first.id, courierJob.id)).toMatchObject({ ok: true });
		retireTask(payMe, leadership(), task.id);
		expect(addTaskToJob(payMe, leadership(), task.id, courierJob.id)).toMatchObject({ ok: true });
	});

	it('refuses adding a Task to a retired Job', () => {
		const payMe = createTestPayMe();
		const courierJob = created(createJob(payMe, leadership(), courier));
		const minerJob = created(createJob(payMe, leadership(), miner));
		const task = created(addTask(payMe, leadership(), { name: 'Haul ore', rate: '3', jobIds: [courierJob.id] }));
		retireJob(payMe, leadership(), minerJob.id);

		expect(addTaskToJob(payMe, leadership(), task.id, minerJob.id)).toEqual({ ok: false, error: { code: 'job-retired', name: 'Miner' } });
	});

	it('lets Leadership retire a Task, keeping its Rate and Jobs', () => {
		const payMe = createTestPayMe();
		const job = created(createJob(payMe, leadership(), courier));
		const task = created(addTask(payMe, leadership(), { name: 'Deliver parcel', rate: '5', jobIds: [job.id] }));

		expect(retireTask(payMe, leadership(), task.id)).toMatchObject({ ok: true, value: { retired: true } });
		expect(getTask(payMe, task.id)).toEqual({ ...task, retired: true });
	});

	it('retires the Tasks of a retired Job unless they still belong to another active Job', () => {
		const payMe = createTestPayMe();
		const courierJob = created(createJob(payMe, leadership(), courier));
		const minerJob = created(createJob(payMe, leadership(), miner));
		const builderJob = created(createJob(payMe, leadership(), builder));
		const parcel = created(addTask(payMe, leadership(), { name: 'Deliver parcel', rate: '5', jobIds: [courierJob.id] }));
		const ore = created(addTask(payMe, leadership(), { name: 'Haul ore', rate: '3', jobIds: [courierJob.id, minerJob.id] }));
		const bricks = created(addTask(payMe, leadership(), { name: 'Haul bricks', rate: '3', jobIds: [courierJob.id, builderJob.id] }));
		const dig = created(addTask(payMe, leadership(), { name: 'Dig tunnel', rate: '9', jobIds: [minerJob.id] }));
		retireJob(payMe, leadership(), builderJob.id);

		expect(retireJob(payMe, leadership(), courierJob.id)).toMatchObject({ ok: true });

		expect(getTask(payMe, parcel.id)?.retired).toBe(true);
		expect(getTask(payMe, ore.id)?.retired).toBe(false);
		expect(getTask(payMe, bricks.id)?.retired).toBe(true);
		expect(getTask(payMe, dig.id)?.retired).toBe(false);
	});

	it('shows the Rate Schedule to anyone', () => {
		const payMe = createTestPayMe();
		const courierJob = created(createJob(payMe, leadership(), courier));
		const minerJob = created(createJob(payMe, leadership(), miner));
		addTask(payMe, leadership(), { name: 'Haul ore', rate: '3.5', jobIds: [minerJob.id, courierJob.id] });
		const parcel = created(addTask(payMe, leadership(), { name: 'Deliver parcel', rate: '1500', jobIds: [courierJob.id] }));
		retireTask(payMe, leadership(), parcel.id);

		const outcome = listTasks(payMe);

		expect(outcome).toMatchObject({ ok: true, value: [{ name: 'Deliver parcel' }, { name: 'Haul ore' }] });
		expect(outcome.ok && outcome.effects).toEqual([
			{
				type: 'private-reply',
				content: ['**Deliver parcel** (retired): 1500 (Courier)', '**Haul ore**: 3.5 (Courier, Miner)'].join('\n')
			}
		]);
	});

	it('says so when the Rate Schedule is empty', () => {
		expect(listTasks(createTestPayMe())).toEqual({
			ok: true,
			value: [],
			effects: [{ type: 'private-reply', content: 'The Rate Schedule is empty.' }]
		});
	});

	it('finds the active Tasks of the given Jobs, once each, by name', () => {
		const payMe = createTestPayMe();
		const courierJob = created(createJob(payMe, leadership(), courier));
		const minerJob = created(createJob(payMe, leadership(), miner));
		const builderJob = created(createJob(payMe, leadership(), builder));
		addTask(payMe, leadership(), { name: 'Haul ore', rate: '3', jobIds: [courierJob.id, minerJob.id] });
		addTask(payMe, leadership(), { name: 'Dig tunnel', rate: '9', jobIds: [minerJob.id] });
		addTask(payMe, leadership(), { name: 'Lay bricks', rate: '2', jobIds: [builderJob.id] });
		const parcel = created(addTask(payMe, leadership(), { name: 'Deliver parcel', rate: '5', jobIds: [courierJob.id] }));
		retireTask(payMe, leadership(), parcel.id);

		const tasks = activeTasksForJobs(payMe, [courierJob.id, minerJob.id]);

		expect(tasks.map((task) => task.name)).toEqual(['Dig tunnel', 'Haul ore']);
	});

	it('refuses every Task change to anyone who is not Leadership', () => {
		const payMe = createTestPayMe();
		const courierJob = created(createJob(payMe, leadership(), courier));
		const minerJob = created(createJob(payMe, leadership(), miner));
		const task = created(addTask(payMe, leadership(), { name: 'Deliver parcel', rate: '5', jobIds: [courierJob.id] }));
		const employee = member('user-1', 'role-courier');
		const notPermitted = { ok: false, error: { code: 'not-permitted' } };

		expect(addTask(payMe, employee, { name: 'Haul ore', rate: '3', jobIds: [courierJob.id] })).toEqual(notPermitted);
		expect(changeRate(payMe, employee, task.id, '9')).toEqual(notPermitted);
		expect(addTaskToJob(payMe, employee, task.id, minerJob.id)).toEqual(notPermitted);
		expect(removeTaskFromJob(payMe, employee, task.id, courierJob.id)).toEqual(notPermitted);
		expect(retireTask(payMe, employee, task.id)).toEqual(notPermitted);
		expect(getTask(payMe, task.id)).toEqual(task);
	});

	it('reports a Task that does not exist', () => {
		const payMe = createTestPayMe();
		const job = created(createJob(payMe, leadership(), courier));
		const notFound = { ok: false, error: { code: 'task-not-found' } };

		expect(changeRate(payMe, leadership(), 99, '9')).toEqual(notFound);
		expect(addTaskToJob(payMe, leadership(), 99, job.id)).toEqual(notFound);
		expect(removeTaskFromJob(payMe, leadership(), 99, job.id)).toEqual(notFound);
		expect(retireTask(payMe, leadership(), 99)).toEqual(notFound);
	});

	it.each(['$12', '12€', '1,500', '12.345', '-5', '0', 'abc', '', '1e3', '.5', 'Infinity', '99999999999999999'])('refuses the Rate %j', (rate) => {
		const payMe = createTestPayMe();
		const job = created(createJob(payMe, leadership(), courier));

		expect(addTask(payMe, leadership(), { name: 'Deliver parcel', rate, jobIds: [job.id] })).toEqual({
			ok: false,
			error: { code: 'invalid-rate', rate }
		});
	});
});
