import { describe, expect, it } from 'vitest';
import { addTask, createJob, hireEmployee, type Outcome, type PayMe } from '../src/core';
import type { NewRequest } from '../src/storage/requests';
import { createTestPayMe, leadership, member } from './support/payme';

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

/** Courier and Miner Jobs, a Task in both, and Alex and Sam hired as Employees. */
function setup() {
	const payMe = createTestPayMe();
	const courier = created(createJob(payMe, leadership(), { name: 'Courier', employeeRoleId: 'role-courier', reviewChannelId: 'review-courier' }));
	const miner = created(createJob(payMe, leadership(), { name: 'Miner', employeeRoleId: 'role-miner', reviewChannelId: 'review-miner' }));
	const task = created(addTask(payMe, leadership(), { name: 'Haul Cart', rate: '100', jobIds: [courier.id, miner.id] }));
	created(hireEmployee(payMe, leadership(), member('user-alex'), 'Alex_42'));
	created(hireEmployee(payMe, leadership(), member('user-sam'), 'Sam_7'));
	const request = (employeeUserId = 'user-alex'): NewRequest => ({
		employeeUserId,
		taskId: task.id,
		eligibleJobIds: [miner.id, courier.id],
		evidence: [{ kind: 'notes', text: 'Hauled' }]
	});
	return { payMe, store: payMe.requests, courier, miner, task, request };
}

function failHistoryWrites(payMe: PayMe) {
	payMe.storage.db.$client.exec(
		"CREATE TRIGGER fail_history BEFORE INSERT ON payment_request_history BEGIN SELECT RAISE(ABORT, 'history unavailable'); END"
	);
}

describe('The Payment Request store', () => {
	it('creates a request in its first round and loads it whole', () => {
		const { store, courier, miner, task, request } = setup();

		const saved = store.create(request(), { state: 'pending', actorUserId: 'user-alex' });

		expect(saved).toEqual({
			number: 1,
			employeeUserId: 'user-alex',
			taskId: task.id,
			state: 'pending',
			round: 1,
			eligibleJobIds: [courier.id, miner.id],
			evidence: [{ round: 1, kind: 'notes', text: 'Hauled' }],
			history: [{ from: null, to: 'pending', actorUserId: 'user-alex', reason: null, at: expect.any(String) }],
			messages: []
		});
		expect(store.load(1)).toEqual(saved);
		expect(store.load(2)).toBeNull();
	});

	it('applies a change from the state it expects, recording it in the history', () => {
		const { store, request } = setup();
		store.create(request(), { state: 'pending', actorUserId: 'user-alex' });

		const applied = store.apply(1, { from: 'pending', to: 'rejected', actorUserId: 'user-casey', reason: 'Blurry' });

		expect(applied).toEqual({ saved: true, request: store.load(1) });
		expect(store.load(1)).toMatchObject({
			state: 'rejected',
			round: 1,
			history: [{ to: 'pending' }, { from: 'pending', to: 'rejected', actorUserId: 'user-casey', reason: 'Blurry' }]
		});
	});

	it('starts the next round with the Evidence a resubmission brings', () => {
		const { store, request } = setup();
		store.create(request(), { state: 'rejected', actorUserId: 'user-alex' });

		store.apply(1, {
			from: 'rejected',
			to: 'pending',
			actorUserId: 'user-alex',
			reason: null,
			resubmission: [
				{ kind: 'link', url: 'https://example.com/proof' },
				{ kind: 'attachment', name: 'proof.png', url: 'https://cdn.example/proof.png' }
			]
		});

		expect(store.load(1)).toMatchObject({
			state: 'pending',
			round: 2,
			evidence: [
				{ round: 1, kind: 'notes', text: 'Hauled' },
				{ round: 2, kind: 'link', url: 'https://example.com/proof' },
				{ round: 2, kind: 'attachment', name: 'proof.png', url: 'https://cdn.example/proof.png' }
			]
		});
	});

	it('reports a change whose expected starting state no longer holds, and leaves the request as it is', () => {
		const { store, request } = setup();
		store.create(request(), { state: 'pending', actorUserId: 'user-alex' });
		store.apply(1, { from: 'pending', to: 'approved', actorUserId: 'user-lin', reason: null });
		const before = store.load(1);

		const applied = store.apply(1, { from: 'pending', to: 'rejected', actorUserId: 'user-casey', reason: 'Blurry' });

		expect(applied).toEqual({ saved: false, current: before });
		expect(store.load(1)).toEqual(before);
		expect(store.apply(99, { from: 'pending', to: 'approved', actorUserId: 'user-lin', reason: null })).toEqual({ saved: false, current: null });
	});

	it('leaves the request unchanged when a change fails partway through', () => {
		const { payMe, store, request } = setup();
		store.create(request(), { state: 'rejected', actorUserId: 'user-alex' });
		const before = store.load(1);
		failHistoryWrites(payMe);

		expect(() =>
			store.apply(1, {
				from: 'rejected',
				to: 'pending',
				actorUserId: 'user-alex',
				reason: null,
				resubmission: [{ kind: 'notes', text: 'Again' }]
			})
		).toThrow('history unavailable');
		expect(store.load(1)).toEqual(before);
	});

	it('creates nothing when creating a request fails partway through', () => {
		const { store, request } = setup();

		expect(() => store.create({ ...request(), eligibleJobIds: [99] }, { state: 'pending', actorUserId: 'user-alex' })).toThrow();
		expect(store.load(1)).toBeNull();
		expect(store.create(request(), { state: 'pending', actorUserId: 'user-alex' }).number).toBe(1);
	});

	it('loads many requests at once, by number or by Employee and state, in number order', () => {
		const { store, request } = setup();
		store.create(request(), { state: 'pending', actorUserId: 'user-alex' });
		store.create(request('user-sam'), { state: 'pending', actorUserId: 'user-sam' });
		store.create(request(), { state: 'denied', actorUserId: 'user-alex' });
		store.create(request(), { state: 'approved', actorUserId: 'user-alex' });
		store.recordMessage(4, { round: 1, jobId: null, channelId: 'thread-user-alex', messageId: 'message-entry' });

		expect(store.loadMany({ numbers: [4, 2, 99] })).toEqual([store.load(2), store.load(4)]);
		expect(store.loadMany({ employeeUserId: 'user-alex', states: ['pending', 'approved'] })).toEqual([store.load(1), store.load(4)]);
		expect(store.loadMany({ numbers: [] })).toEqual([]);
	});

	it('records each message once, moving a re-recorded message to the end', () => {
		const { store, request } = setup();
		store.create(request(), { state: 'pending', actorUserId: 'user-alex' });

		store.recordMessage(1, { round: 1, jobId: null, channelId: 'thread', messageId: 'message-entry' });
		store.recordMessage(1, { round: 1, jobId: 1, channelId: 'review-courier', messageId: 'message-review' });
		store.recordMessage(1, { round: 1, jobId: null, channelId: 'thread', messageId: 'message-entry' });

		expect(store.load(1)?.messages.map((message) => message.messageId)).toEqual(['message-review', 'message-entry']);
	});
});
