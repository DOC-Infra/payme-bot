import { describe, expect, it } from 'vitest';
import { addManagerRole, createJob, editJob, getJob, jobsHeldBy, listJobs, removeManagerRole, retireJob, type Outcome } from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const courier = { name: 'Courier', employeeRoleId: 'role-courier', reviewChannelId: 'channel-courier-review' };
const miner = { name: 'Miner', employeeRoleId: 'role-miner', reviewChannelId: 'channel-miner-review' };

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

describe('Jobs', () => {
	it('lets Leadership create a Job with a name, Employee role and Review Channel', () => {
		const payMe = createTestPayMe();

		const outcome = createJob(payMe, leadership(), courier);

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(getJob(payMe, outcome.value.id)).toEqual({ id: outcome.value.id, ...courier, managerRoleIds: [], retired: false });
	});

	it('refuses a Job whose name is already taken, ignoring case', () => {
		const payMe = createTestPayMe();
		createJob(payMe, leadership(), courier);

		expect(createJob(payMe, leadership(), { ...courier, name: 'courier' })).toEqual({
			ok: false,
			error: { code: 'job-name-taken', name: 'courier' }
		});
	});

	it("lets Leadership edit a Job's name, Employee role and Review Channel", () => {
		const payMe = createTestPayMe();
		const { id } = created(createJob(payMe, leadership(), courier));
		const changes = { name: 'Logistics', employeeRoleId: 'role-logistics', reviewChannelId: 'channel-logistics-review' };

		expect(editJob(payMe, leadership(), id, changes)).toMatchObject({ ok: true });

		expect(getJob(payMe, id)).toMatchObject(changes);
	});

	it('leaves the details that an edit does not mention unchanged', () => {
		const payMe = createTestPayMe();
		const { id } = created(createJob(payMe, leadership(), courier));

		editJob(payMe, leadership(), id, { name: 'COURIER' });

		expect(getJob(payMe, id)).toMatchObject({ ...courier, name: 'COURIER' });
	});

	it("refuses renaming a Job to another Job's name", () => {
		const payMe = createTestPayMe();
		createJob(payMe, leadership(), courier);
		const { id } = created(createJob(payMe, leadership(), miner));

		expect(editJob(payMe, leadership(), id, { name: 'Courier' })).toEqual({
			ok: false,
			error: { code: 'job-name-taken', name: 'Courier' }
		});
	});

	it("lets Leadership add and remove a Job's manager roles", () => {
		const payMe = createTestPayMe();
		const { id } = created(createJob(payMe, leadership(), courier));

		addManagerRole(payMe, leadership(), id, 'role-courier-manager', []);
		addManagerRole(payMe, leadership(), id, 'role-courier-lead', []);
		addManagerRole(payMe, leadership(), id, 'role-courier-manager', []);
		expect(getJob(payMe, id)?.managerRoleIds).toEqual(['role-courier-manager', 'role-courier-lead']);

		removeManagerRole(payMe, leadership(), id, 'role-courier-manager');
		expect(getJob(payMe, id)?.managerRoleIds).toEqual(['role-courier-lead']);
	});

	it('lets Leadership retire a Job, which stays listed as retired', () => {
		const payMe = createTestPayMe();
		const { id } = created(createJob(payMe, leadership(), courier));

		expect(retireJob(payMe, leadership(), id)).toMatchObject({ ok: true, value: { retired: true } });

		expect(getJob(payMe, id)?.retired).toBe(true);
		expect(listJobs(payMe, leadership())).toMatchObject({ ok: true, value: [{ id, retired: true }] });
	});

	it('lists each Job with its roles and Review Channel', () => {
		const payMe = createTestPayMe();
		const { id } = created(createJob(payMe, leadership(), miner));
		createJob(payMe, leadership(), courier);
		addManagerRole(payMe, leadership(), id, 'role-miner-manager', []);
		addManagerRole(payMe, leadership(), id, 'role-miner-lead', []);
		retireJob(payMe, leadership(), id);

		const outcome = listJobs(payMe, leadership());

		expect(outcome).toMatchObject({ ok: true, value: [{ name: 'Courier' }, { name: 'Miner' }] });
		expect(outcome.ok && outcome.effects).toEqual([
			{
				type: 'private-reply',
				content: [
					'**Courier**',
					'Employee role: <@&role-courier> | Manager roles: none | Review Channel: <#channel-courier-review>',
					'**Miner** (retired)',
					'Employee role: <@&role-miner> | Manager roles: <@&role-miner-manager>, <@&role-miner-lead> | Review Channel: <#channel-miner-review>'
				].join('\n')
			}
		]);
	});

	it('says so when there are no Jobs to list', () => {
		const payMe = createTestPayMe();

		expect(listJobs(payMe, leadership())).toEqual({
			ok: true,
			value: [],
			effects: [{ type: 'private-reply', content: 'There are no Jobs yet.' }]
		});
	});

	it('refuses every Job change and the Job list to anyone who is not Leadership', () => {
		const payMe = createTestPayMe();
		const { id } = created(createJob(payMe, leadership(), courier));
		addManagerRole(payMe, leadership(), id, 'role-courier-manager', []);
		const manager = member('user-manager', 'role-courier-manager', 'role-courier');
		const notPermitted = { ok: false, error: { code: 'not-permitted' } };

		expect(createJob(payMe, manager, miner)).toEqual(notPermitted);
		expect(editJob(payMe, manager, id, { name: 'Logistics' })).toEqual(notPermitted);
		expect(addManagerRole(payMe, manager, id, 'role-other', [])).toEqual(notPermitted);
		expect(removeManagerRole(payMe, manager, id, 'role-courier-manager')).toEqual(notPermitted);
		expect(retireJob(payMe, manager, id)).toEqual(notPermitted);
		expect(listJobs(payMe, manager)).toEqual(notPermitted);
		expect(getJob(payMe, id)).toEqual({ id, ...courier, managerRoleIds: ['role-courier-manager'], retired: false });
	});

	it('finds the active Jobs a member holds from their roles', () => {
		const payMe = createTestPayMe();
		createJob(payMe, leadership(), courier);
		const { id } = created(createJob(payMe, leadership(), miner));
		createJob(payMe, leadership(), { name: 'Builder', employeeRoleId: 'role-builder', reviewChannelId: 'channel-builder-review' });
		retireJob(payMe, leadership(), id);

		const held = jobsHeldBy(payMe, member('user-1', 'role-courier', 'role-miner'));

		expect(held.map((job) => job.name)).toEqual(['Courier']);
	});

	it('reports a Job that does not exist', () => {
		const payMe = createTestPayMe();

		const notFound = { ok: false, error: { code: 'job-not-found' } };
		expect(editJob(payMe, leadership(), 99, { name: 'Courier' })).toEqual(notFound);
		expect(addManagerRole(payMe, leadership(), 99, 'role-courier-manager', [])).toEqual(notFound);
		expect(removeManagerRole(payMe, leadership(), 99, 'role-courier-manager')).toEqual(notFound);
	});
});
