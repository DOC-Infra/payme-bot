import { describe, expect, it } from 'vitest';
import {
	addManagerRole,
	addTask,
	amendForm,
	amendRequest,
	createJob,
	getPaymentRequest,
	hireEmployee,
	recordRequestMessage,
	recordRequestsThread,
	rejectRequest,
	setNotesRequired,
	submitRequest,
	withdrawRequest,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const screenshot = { name: 'proof.png', url: 'https://cdn.example/proof.png' };
const clearer = { name: 'clearer.png', url: 'https://cdn.example/clearer.png' };
const alex = member('user-alex', 'role-courier');
const courierManager = member('user-casey', 'role-courier-manager');

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

function job(payMe: PayMe, name: string) {
	const slug = name.toLowerCase();
	const result = created(createJob(payMe, leadership(), { name, employeeRoleId: `role-${slug}`, reviewChannelId: `review-${slug}` }));
	addManagerRole(payMe, leadership(), result.id, `role-${slug}-manager`, []);
	return result;
}

/** Alex, a Courier, submits R-1 for Deliver Parcel. */
function pendingParcel() {
	const payMe = createTestPayMe();
	const courier = job(payMe, 'Courier');
	const parcel = created(addTask(payMe, leadership(), { name: 'Deliver Parcel', rate: '100', jobIds: [courier.id] }));
	created(hireEmployee(payMe, leadership(), member('user-alex'), 'Alex_42'));
	recordRequestsThread(payMe, 'user-alex', { channelId: 'channel-alex', pinnedMessageId: 'pin-alex', threadId: 'thread-alex' });
	created(submitRequest(payMe, alex, { taskId: parcel.id, notes: 'Done', link: null, files: [screenshot] }));
	return { payMe, courier };
}

function rejectedParcel() {
	const scenario = pendingParcel();
	created(rejectRequest(scenario.payMe, courierManager, 1, 'Blurry screenshot'));
	return scenario;
}

describe('Amending a Rejected Payment Request', () => {
	it('returns it to Pending in a new round, keeping the original Evidence and adding the new', () => {
		const { payMe } = rejectedParcel();

		const outcome = amendRequest(payMe, alex, 1, { notes: ' Retook it ', link: 'https://example.com/more', files: [clearer] });

		expect(outcome).toMatchObject({ ok: true, value: { state: 'pending', round: 2 } });
		expect(getPaymentRequest(payMe, 1)?.evidence).toEqual([
			{ round: 1, kind: 'notes', text: 'Done' },
			{ round: 1, kind: 'attachment', ...screenshot },
			{ round: 2, kind: 'notes', text: 'Retook it' },
			{ round: 2, kind: 'link', url: 'https://example.com/more' },
			{ round: 2, kind: 'attachment', ...clearer }
		]);
		expect(getPaymentRequest(payMe, 1)?.history.at(-1)).toMatchObject({
			from: 'rejected',
			to: 'pending',
			actorUserId: 'user-alex',
			reason: null
		});
	});

	it('needs notes and a valid link', () => {
		const { payMe } = rejectedParcel();

		expect(amendRequest(payMe, alex, 1, { notes: ' ', link: null, files: [clearer] })).toEqual({ ok: false, error: { code: 'notes-required' } });
		expect(amendRequest(payMe, alex, 1, { notes: 'More', link: 'nope', files: [] })).toEqual({
			ok: false,
			error: { code: 'invalid-link', link: 'nope' }
		});
	});
});

describe('Amending a request for a Task that needs no notes', () => {
	it('accepts blank notes alongside a link or file, but not an empty amendment', () => {
		const { payMe } = rejectedParcel();
		created(setNotesRequired(payMe, leadership(), getPaymentRequest(payMe, 1)!.taskId, false));

		expect(amendRequest(payMe, alex, 1, { notes: ' ', link: null, files: [] })).toEqual({ ok: false, error: { code: 'amendment-empty' } });
		expect(created(amendRequest(payMe, alex, 1, { notes: ' ', link: null, files: [clearer] })).state).toBe('pending');
	});
});

describe('Opening the amend form', () => {
	it("requires notes when the request's Task needs them, and not once Leadership drops the requirement", () => {
		const { payMe } = rejectedParcel();

		expect(amendForm(payMe, alex, 1)).toMatchObject({ ok: true, value: { notesRequired: true, notesHint: 'What did you change or add?' } });
		created(setNotesRequired(payMe, leadership(), getPaymentRequest(payMe, 1)!.taskId, false));
		expect(amendForm(payMe, alex, 1)).toMatchObject({
			ok: true,
			value: { notesRequired: false, notesHint: 'What did you change or add? Optional.' }
		});
	});

	it('refuses a request that cannot be amended', () => {
		const { payMe } = pendingParcel();

		expect(amendForm(payMe, alex, 1)).toEqual({ ok: false, error: { code: 'cannot-amend', number: 1, state: 'pending' } });
	});
});

describe('What resubmitting posts', () => {
	it('posts the added Evidence as a new entry in the Requests Thread and a new review copy in each eligible Review Channel', () => {
		const { payMe, courier } = rejectedParcel();

		const outcome = amendRequest(payMe, alex, 1, { notes: 'Retook it', link: 'https://example.com/more', files: [clearer] });

		const fields = [
			{ name: 'Notes', value: 'Retook it' },
			{ name: 'Link', value: 'https://example.com/more' }
		];
		expect(outcome.ok && outcome.effects).toEqual([
			{ type: 'update-entry-actions', requestNumber: 1, round: 1, actions: [] },
			{
				type: 'post-request-entry',
				requestNumber: 1,
				round: 2,
				employeeUserId: 'user-alex',
				card: {
					tone: 'info',
					title: 'R-1 · Deliver Parcel',
					description: 'Amended and resubmitted by <@user-alex>, Pending review.',
					fields,
					footer: 'Resubmission 1'
				},
				files: [clearer],
				actions: ['withdraw']
			},
			{
				type: 'post-review-message',
				requestNumber: 1,
				round: 2,
				jobId: courier.id,
				channelId: 'review-courier',
				card: { tone: 'info', title: 'R-1 · Deliver Parcel', description: 'From <@user-alex> (Alex_42)', fields, footer: 'Resubmission 1' },
				files: [clearer]
			}
		]);
	});
});

describe('Withdrawing a Payment Request', () => {
	it('moves a Pending request to Withdrawn, marks its Requests Thread entry and deletes its review copies', () => {
		const { payMe } = pendingParcel();

		expect(withdrawRequest(payMe, alex, 1)).toEqual({
			ok: true,
			value: getPaymentRequest(payMe, 1),
			effects: [
				{
					type: 'update-request-entry',
					requestNumber: 1,
					round: 1,
					card: {
						tone: 'neutral',
						title: 'R-1 · Deliver Parcel',
						description: '**Withdrawn** by <@user-alex>',
						fields: [{ name: 'Notes', value: 'Done' }],
						footer: undefined
					},
					actions: []
				},
				{ type: 'delete-review-copies', requestNumber: 1, messages: [] }
			]
		});
		expect(getPaymentRequest(payMe, 1)?.history.at(-1)).toMatchObject({ from: 'pending', to: 'withdrawn', actorUserId: 'user-alex' });
	});

	it('deletes the review copies of every round, keeping the Requests Thread entries', () => {
		const { payMe, courier } = rejectedParcel();
		recordRequestMessage(payMe, 1, { round: 1, jobId: null, channelId: 'thread-alex', messageId: 'entry-1' });
		recordRequestMessage(payMe, 1, { round: 1, jobId: courier.id, channelId: 'review-courier', messageId: 'copy-1' });
		created(amendRequest(payMe, alex, 1, { notes: 'Retook it', link: null, files: [clearer] }));
		recordRequestMessage(payMe, 1, { round: 2, jobId: null, channelId: 'thread-alex', messageId: 'entry-2' });
		recordRequestMessage(payMe, 1, { round: 2, jobId: courier.id, channelId: 'review-courier', messageId: 'copy-2' });

		expect(withdrawRequest(payMe, alex, 1)).toMatchObject({
			effects: expect.arrayContaining([
				{
					type: 'delete-review-copies',
					requestNumber: 1,
					messages: [
						{ channelId: 'review-courier', messageId: 'copy-1' },
						{ channelId: 'review-courier', messageId: 'copy-2' }
					]
				}
			])
		});
	});
});
