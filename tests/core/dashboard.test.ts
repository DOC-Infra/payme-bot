import { describe, expect, it } from 'vitest';
import {
	setManagerRoles,
	addTask,
	approveRequest,
	createJob,
	createProject,
	dashboardCard,
	generatePayout,
	giveShare,
	hireEmployee,
	recordRequestsThread,
	submitRequest,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const alex = member('user-alex', 'role-courier', 'role-builder');
const bo = member('user-bo', 'role-courier');

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

function job(payMe: PayMe, name: string) {
	const slug = name.toLowerCase();
	const result = created(createJob(payMe, leadership(), { name, employeeRoleId: `role-${slug}`, reviewChannelId: `review-${slug}` }));
	setManagerRoles(payMe, leadership(), result.id, [`role-${slug}-manager`], []);
	return result;
}

function hire(payMe: PayMe, userId: string, minecraftName: string) {
	created(hireEmployee(payMe, leadership(), member(userId), minecraftName));
	recordRequestsThread(payMe, userId, { channelId: `channel-${userId}`, pinnedMessageId: `pin-${userId}`, threadId: `thread-${userId}` });
}

describe('The Leadership dashboard', () => {
	it('says when there is nothing to review, pay or share', () => {
		const payMe = createTestPayMe();
		job(payMe, 'Courier');

		expect(dashboardCard(payMe)).toEqual({
			tone: 'info',
			title: 'PayMe dashboard',
			description: [
				'**Pending review**: 0 requests',
				'- **Courier**: 0 requests pending review, $0 to pay',
				'',
				'**To pay**: Nobody is owed anything outside an Open Payout.',
				'',
				'**Open Projects**',
				'None.'
			].join('\n'),
			footer: 'Updates as requests, Payouts and Projects change.'
		});
	});

	it('sums pending requests and what is owed by Job, lists Open Payouts and what is left in each Open Project', () => {
		const payMe = createTestPayMe();
		const courier = job(payMe, 'Courier');
		const builder = job(payMe, 'Builder');
		hire(payMe, 'user-alex', 'Alex_42');
		hire(payMe, 'user-bo', 'Bo_7');
		const parcel = created(addTask(payMe, leadership(), { name: 'Deliver Parcel', rate: '1000', jobIds: [courier.id] }));
		const evidence = { taskId: parcel.id, notes: 'Done', link: 'https://example.com', files: [] };

		created(submitRequest(payMe, alex, evidence));
		created(approveRequest(payMe, leadership(), created(submitRequest(payMe, bo, evidence)).number));
		created(approveRequest(payMe, leadership(), created(submitRequest(payMe, alex, evidence)).number));
		created(generatePayout(payMe, leadership(), 'user-alex'));
		const bridge = created(createProject(payMe, leadership(), { name: 'Bridge', jobId: builder.id, budget: '5000' }));
		created(giveShare(payMe, leadership(), bridge.id, alex, { amount: '1250.5', note: null }));

		expect(dashboardCard(payMe).description).toBe(
			[
				'**Pending review**: 1 request',
				'- **Builder**: 0 requests pending review, $1,250.5 to pay',
				'- **Courier**: 1 request pending review, $1,000 to pay',
				'',
				'**To pay**: About **$2,250.5** for 2 Employees, estimated at current Rates.',
				'- **P-1** Alex_42: $1,000, waiting to be marked paid',
				'',
				'**Open Projects**',
				'- **Bridge**: $3,749.5 left of $5,000'
			].join('\n')
		);
	});
});
