import { describe, expect, it } from 'vitest';
import {
	setManagerRoles,
	addTask,
	approveRequest,
	balanceOf,
	budgetOf,
	closeProject,
	createJob,
	createProject,
	discardPayout,
	editShare,
	fundProject,
	generatePayout,
	getProject,
	giveShare,
	hireEmployee,
	listProjects,
	markPayoutPaid,
	myRequests,
	owedTo,
	recordRequestsThread,
	removeShare,
	retireJob,
	showPayouts,
	showProject,
	submitRequest,
	totalOwed,
	type Actor,
	type Outcome,
	type PayMe
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

const alex = member('user-alex', 'role-builder');
const morgan = member('user-morgan', 'role-builder-manager');
const notPermitted = { ok: false, error: { code: 'not-permitted' } };

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

/** A Builder Job managed by Morgan, with Alex hired as a Builder, and a Bridge Project with a budget of 1000. */
function bridge() {
	const payMe = createTestPayMe();
	const builder = job(payMe, 'Builder');
	hire(payMe, 'user-alex', 'Alex_42');
	const project = created(createProject(payMe, leadership(), { name: 'Bridge', jobId: builder.id, budget: '1000' }));
	return { payMe, builder, project };
}

describe('Creating a Project', () => {
	it('gives it the Job and an opening budget', () => {
		const { payMe, builder, project } = bridge();

		expect(project).toMatchObject({ id: 1, name: 'Bridge', jobId: builder.id, state: 'open', funding: [{ amount: 100000 }], shares: [] });
		expect(budgetOf(project)).toBe(100000);
		expect(balanceOf(getProject(payMe, project.id)!)).toBe(100000);
	});

	it('is for Leadership only', () => {
		const { payMe, builder } = bridge();
		expect(createProject(payMe, morgan, { name: 'Tower', jobId: builder.id, budget: '10' })).toEqual(notPermitted);
	});

	it('refuses a bad budget, a taken name and a retired Job', () => {
		const { payMe, builder } = bridge();
		const old = job(payMe, 'Old');
		created(retireJob(payMe, leadership(), old.id));

		expect(createProject(payMe, leadership(), { name: 'Tower', jobId: builder.id, budget: '0' })).toEqual({
			ok: false,
			error: { code: 'invalid-amount', amount: '0' }
		});
		expect(createProject(payMe, leadership(), { name: 'bridge', jobId: builder.id, budget: '10' })).toEqual({
			ok: false,
			error: { code: 'project-name-taken', name: 'bridge' }
		});
		expect(createProject(payMe, leadership(), { name: 'Tower', jobId: old.id, budget: '10' })).toEqual({
			ok: false,
			error: { code: 'job-retired', name: 'Old' }
		});
	});
});

describe('Funding a Project', () => {
	it('adds to the budget, for example in a later pay period', () => {
		const { payMe, project } = bridge();

		const funded = created(fundProject(payMe, leadership(), project.id, '250.5'));

		expect(budgetOf(funded)).toBe(125050);
		expect(funded.funding.map((entry) => entry.amount)).toEqual([100000, 25050]);
	});

	it('is for Leadership only, and only while the Project is Open', () => {
		const { payMe, project } = bridge();
		expect(fundProject(payMe, morgan, project.id, '10')).toEqual(notPermitted);

		created(closeProject(payMe, leadership(), project.id));
		expect(fundProject(payMe, leadership(), project.id, '10')).toEqual({ ok: false, error: { code: 'project-closed', name: 'Bridge' } });
	});
});

describe('Giving a Share', () => {
	it("lets a Manager of the Project's Job give an Employee holding it part of the budget, and tells the Employee", () => {
		const { payMe, builder, project } = bridge();

		const outcome = giveShare(payMe, morgan, project.id, alex, { amount: '400', note: ' Laid the deck ' });

		expect(outcome).toMatchObject({
			ok: true,
			value: {
				id: 1,
				projectId: project.id,
				jobId: builder.id,
				employeeUserId: 'user-alex',
				amount: 40000,
				note: 'Laid the deck',
				paid: false
			},
			effects: [
				{
					type: 'post-to-requests-thread',
					employeeUserId: 'user-alex',
					ping: true,
					card: { title: 'S-1 · Bridge', fields: [{ name: 'Note', value: 'Laid the deck' }] }
				},
				{ type: 'private-reply', card: { description: 'Gave <@user-alex> S-1, $400 from the Bridge Project. $600 is left to give.' } }
			]
		});
		expect(balanceOf(getProject(payMe, project.id)!)).toBe(60000);
	});

	it('refuses more than is left to give', () => {
		const { payMe, project } = bridge();
		created(giveShare(payMe, morgan, project.id, alex, { amount: '700', note: null }));

		expect(giveShare(payMe, morgan, project.id, alex, { amount: '300.01', note: null })).toEqual({
			ok: false,
			error: { code: 'over-budget', name: 'Bridge', balance: 30000 }
		});
	});

	it('lets Managers and Leadership give themselves a Share, even without holding the Job', () => {
		const { payMe, project } = bridge();
		hire(payMe, 'user-morgan', 'Morgan_1');
		hire(payMe, 'user-leadership', 'Lead_1');

		expect(giveShare(payMe, morgan, project.id, morgan, { amount: '100', note: null }).ok).toBe(true);
		expect(giveShare(payMe, leadership(), project.id, leadership(), { amount: '100', note: null }).ok).toBe(true);
		expect(editShare(payMe, morgan, 1, { amount: '150' }).ok).toBe(true);
		expect(removeShare(payMe, leadership(), 2).ok).toBe(true);
		expect(balanceOf(getProject(payMe, project.id)!)).toBe(85000);
	});

	it('refuses Managers of other Jobs and an Employee who neither holds nor manages the Job', () => {
		const { payMe, project } = bridge();
		job(payMe, 'Courier');
		hire(payMe, 'user-bo', 'Bo_7');

		expect(giveShare(payMe, member('user-casey', 'role-courier-manager'), project.id, alex, { amount: '1', note: null })).toEqual({
			ok: false,
			error: { code: 'not-project-manager', job: 'Builder' }
		});
		expect(giveShare(payMe, morgan, project.id, member('user-bo', 'role-courier'), { amount: '1', note: null })).toEqual({
			ok: false,
			error: { code: 'share-job-not-held', job: 'Builder' }
		});
		expect(giveShare(payMe, morgan, project.id, member('user-nobody', 'role-builder'), { amount: '1', note: null })).toEqual({
			ok: false,
			error: { code: 'employee-not-found' }
		});
	});

	it('is refused once the Project is closed', () => {
		const { payMe, project } = bridge();
		created(closeProject(payMe, leadership(), project.id));

		expect(giveShare(payMe, morgan, project.id, alex, { amount: '1', note: null })).toEqual({
			ok: false,
			error: { code: 'project-closed', name: 'Bridge' }
		});
	});
});

describe('Paying Shares', () => {
	function withRequestAndShare() {
		const setup = bridge();
		const { payMe, builder, project } = setup;
		const wall = created(addTask(payMe, leadership(), { name: 'Build Wall', rate: '50', jobIds: [builder.id] }));
		const request = created(submitRequest(payMe, alex, { taskId: wall.id, notes: 'Done', link: 'https://example.com', files: [] }));
		created(approveRequest(payMe, leadership(), request.number));
		created(giveShare(payMe, morgan, project.id, alex, { amount: '400', note: null }));
		return setup;
	}

	it('owes a Share at its exact amount alongside Approved requests', () => {
		const { payMe } = withRequestAndShare();

		const owed = owedTo(payMe, 'user-alex');

		expect(owed).toMatchObject({ unpaidRequestNumbers: [1], estimatedTotal: 5000, unpaidShareIds: [1], sharesTotal: 40000 });
		expect(totalOwed(owed)).toBe(45000);
	});

	it("puts the Share into the Employee's next Payout and its total, under the Project's Job", () => {
		const { payMe, builder, project } = withRequestAndShare();

		const outcome = generatePayout(payMe, leadership(), 'user-alex');

		expect(outcome).toMatchObject({
			ok: true,
			value: { total: 45000, lines: [{ requestNumber: 1 }], shares: [{ shareId: 1, projectId: project.id, jobId: builder.id, amount: 40000 }] }
		});
		expect(outcome.ok && outcome.effects[0]).toMatchObject({
			card: { description: expect.stringContaining('**Builder**: $450\n- **R-1** Build Wall: $50\n- **S-1** Bridge Project: $400') }
		});
		expect(owedTo(payMe, 'user-alex')).toMatchObject({ unpaidShareIds: [], sharesTotal: 0, openPayout: { total: 45000 } });
	});

	it('pays a Share with its Payout, and frees it for a new Payout when the Payout is discarded', () => {
		const { payMe, project } = withRequestAndShare();
		created(generatePayout(payMe, leadership(), 'user-alex'));
		created(discardPayout(payMe, leadership(), 1, 1));

		expect(owedTo(payMe, 'user-alex')).toMatchObject({ unpaidShareIds: [1] });

		created(generatePayout(payMe, leadership(), 'user-alex'));
		created(markPayoutPaid(payMe, leadership(), 2, 1));

		expect(getProject(payMe, project.id)!.shares).toMatchObject([{ id: 1, paid: true }]);
		expect(totalOwed(owedTo(payMe, 'user-alex'))).toBe(0);
	});

	it('adds requests approved after a Payout of only Shares to that Payout when it is generated again', () => {
		const { payMe, builder, project } = bridge();
		created(giveShare(payMe, morgan, project.id, alex, { amount: '400', note: null }));
		created(generatePayout(payMe, leadership(), 'user-alex'));
		const wall = created(addTask(payMe, leadership(), { name: 'Build Wall', rate: '50', jobIds: [builder.id] }));
		const request = created(submitRequest(payMe, alex, { taskId: wall.id, notes: 'Done', link: 'https://example.com', files: [] }));
		created(approveRequest(payMe, leadership(), request.number));

		expect(generatePayout(payMe, leadership(), 'user-alex')).toMatchObject({
			ok: true,
			value: { number: 1, total: 45000, lines: [{ requestNumber: 1 }], shares: [{ shareId: 1 }] }
		});
	});

	it('generates a Payout for an Employee owed only Shares', () => {
		const { payMe, project } = bridge();
		created(giveShare(payMe, morgan, project.id, alex, { amount: '1000', note: null }));

		expect(generatePayout(payMe, leadership(), 'user-alex')).toMatchObject({ ok: true, value: { total: 100000, lines: [] } });
	});

	it("shows a Manager the Employees owed Shares from their Jobs' Projects", () => {
		const { payMe, project } = bridge();
		created(giveShare(payMe, morgan, project.id, alex, { amount: '10', note: null }));

		expect(created(showPayouts(payMe, morgan, [])).owed).toMatchObject([{ employeeUserId: 'user-alex', unpaidShareIds: [1] }]);
	});
});

describe('Viewing Projects', () => {
	it("shows Managers their Jobs' Projects, and Leadership every Project", () => {
		const { payMe } = bridge();
		const courier = job(payMe, 'Courier');
		created(createProject(payMe, leadership(), { name: 'Rush', jobId: courier.id, budget: '5' }));

		expect(created(listProjects(payMe, morgan)).map((project) => project.name)).toEqual(['Bridge']);
		expect(created(listProjects(payMe, leadership())).map((project) => project.name)).toEqual(['Bridge', 'Rush']);
		expect(listProjects(payMe, alex)).toEqual(notPermitted);
	});

	it('shows the budget, what is left and every Share to Managers of the Job only', () => {
		const { payMe, project } = bridge();
		created(giveShare(payMe, morgan, project.id, alex, { amount: '250', note: 'Pillars' }));

		expect(showProject(payMe, morgan, project.id)).toMatchObject({
			ok: true,
			effects: [
				{
					card: {
						title: 'Bridge Project',
						description: expect.stringContaining('**S-1** <@user-alex>: $250 (Pillars), given by <@user-morgan>, Owed'),
						fields: expect.arrayContaining([
							{ name: 'Budget', value: '$1,000', inline: true },
							{ name: 'Left to give', value: '$750', inline: true }
						])
					}
				}
			]
		});
		expect(showProject(payMe, alex, project.id)).toEqual({ ok: false, error: { code: 'not-project-manager', job: 'Builder' } });
	});

	it('gives Managers Share buttons, Leadership funding and closing too, and a closed Project none', () => {
		const { payMe, project } = bridge();
		const actionsFor = (actor: Actor) => showProject(payMe, actor, project.id);

		expect(actionsFor(morgan)).toMatchObject({ effects: [{ type: 'show-project', projectId: project.id, actions: ['share'] }] });
		created(giveShare(payMe, morgan, project.id, alex, { amount: '10', note: null }));
		expect(actionsFor(morgan)).toMatchObject({ effects: [{ actions: ['share', 'change-share'] }] });
		expect(actionsFor(leadership())).toMatchObject({ effects: [{ actions: ['share', 'change-share', 'fund', 'close'] }] });

		created(closeProject(payMe, leadership(), project.id));
		expect(actionsFor(leadership())).toMatchObject({ effects: [{ actions: [] }] });
	});

	it('lists Open Projects first to pick from, and lets only Leadership create one', () => {
		const { payMe, builder, project } = bridge();
		const old = created(createProject(payMe, leadership(), { name: 'Old Road', jobId: builder.id, budget: '5' }));
		created(closeProject(payMe, leadership(), old.id));
		created(createProject(payMe, leadership(), { name: 'Tower', jobId: builder.id, budget: '5' }));

		expect(listProjects(payMe, leadership())).toMatchObject({
			effects: [
				{
					type: 'show-projects',
					canCreate: true,
					projects: [
						{ id: project.id, label: 'Bridge' },
						{ id: 3, label: 'Tower' },
						{ id: old.id, label: 'Old Road (closed)' }
					]
				}
			]
		});
		expect(listProjects(payMe, morgan)).toMatchObject({ effects: [{ canCreate: false }] });
	});
});

describe("An Employee's own view", () => {
	it('shows Shares owed even when the Employee has no open requests', () => {
		const { payMe, project } = bridge();
		created(giveShare(payMe, morgan, project.id, alex, { amount: '400', note: null }));

		expect(myRequests(payMe, alex)).toMatchObject({
			ok: true,
			value: { estimatedOwed: 40000 },
			effects: [{ card: { description: 'You have no open Payment Requests.\nShares S-1: $400 owed' } }]
		});
	});
});

describe('Changing a Share before it is paid out', () => {
	function withShare() {
		const setup = bridge();
		created(giveShare(setup.payMe, morgan, setup.project.id, alex, { amount: '400', note: 'Deck' }));
		return setup;
	}

	it('changes the amount within what is left of the budget, and tells the Employee', () => {
		const { payMe, project } = withShare();

		expect(editShare(payMe, morgan, 1, { amount: '1000' })).toMatchObject({
			ok: true,
			value: { id: 1, amount: 100000, note: 'Deck' },
			effects: [
				{
					type: 'post-to-requests-thread',
					employeeUserId: 'user-alex',
					ping: true,
					card: { title: 'S-1 · Bridge', description: '<@user-morgan> changed its amount from $400 to **$1,000**.' }
				},
				{ type: 'private-reply' }
			]
		});
		expect(balanceOf(getProject(payMe, project.id)!)).toBe(0);
		expect(editShare(payMe, morgan, 1, { amount: '1000.01' })).toEqual({
			ok: false,
			error: { code: 'over-budget', name: 'Bridge', balance: 100000 }
		});
	});

	it('changes the note, and refuses an edit that changes nothing', () => {
		const { payMe } = withShare();

		expect(editShare(payMe, morgan, 1, { note: 'Deck and rails' })).toMatchObject({ ok: true, value: { amount: 40000, note: 'Deck and rails' } });
		expect(editShare(payMe, morgan, 1, {})).toEqual({ ok: false, error: { code: 'share-edit-empty' } });
		expect(editShare(payMe, morgan, 1, { amount: '400', note: 'Deck and rails' })).toEqual({ ok: false, error: { code: 'share-edit-empty' } });
		expect(editShare(payMe, morgan, 1, { amount: 'lots' })).toEqual({ ok: false, error: { code: 'invalid-amount', amount: 'lots' } });
	});

	it('removes a Share, returning its amount to the budget and leaving nothing owed', () => {
		const { payMe, project } = withShare();

		expect(removeShare(payMe, morgan, 1)).toMatchObject({
			ok: true,
			effects: [{ card: { description: 'Removed by <@user-morgan>. It will not be paid.' } }, { type: 'private-reply' }]
		});
		expect(getProject(payMe, project.id)!.shares).toEqual([]);
		expect(balanceOf(getProject(payMe, project.id)!)).toBe(100000);
		expect(totalOwed(owedTo(payMe, 'user-alex'))).toBe(0);
		expect(removeShare(payMe, morgan, 1)).toEqual({ ok: false, error: { code: 'share-not-found' } });
		expect(editShare(payMe, morgan, 1, { amount: '1' })).toEqual({ ok: false, error: { code: 'share-not-found' } });
	});

	it('refuses while the Share is in an Open Payout, and allows it again once that Payout is discarded', () => {
		const { payMe } = withShare();
		created(generatePayout(payMe, leadership(), 'user-alex'));

		expect(editShare(payMe, morgan, 1, { amount: '1' })).toEqual({ ok: false, error: { code: 'share-in-payout', id: 1, payoutNumber: 1 } });
		expect(removeShare(payMe, morgan, 1)).toEqual({ ok: false, error: { code: 'share-in-payout', id: 1, payoutNumber: 1 } });

		created(discardPayout(payMe, leadership(), 1, 1));
		created(removeShare(payMe, morgan, 1));
		expect(generatePayout(payMe, leadership(), 'user-alex')).toEqual({ ok: false, error: { code: 'nothing-owed' } });
	});

	it('refuses once the Share is paid', () => {
		const { payMe } = withShare();
		created(generatePayout(payMe, leadership(), 'user-alex'));
		created(markPayoutPaid(payMe, leadership(), 1, 1));

		expect(editShare(payMe, morgan, 1, { amount: '1' })).toEqual({ ok: false, error: { code: 'share-paid', id: 1 } });
		expect(removeShare(payMe, morgan, 1)).toEqual({ ok: false, error: { code: 'share-paid', id: 1 } });
	});

	it('refuses Managers of other Jobs and a closed Project', () => {
		const { payMe, project } = withShare();
		job(payMe, 'Courier');

		expect(removeShare(payMe, member('user-casey', 'role-courier-manager'), 1)).toEqual({
			ok: false,
			error: { code: 'not-project-manager', job: 'Builder' }
		});

		created(closeProject(payMe, leadership(), project.id));
		expect(removeShare(payMe, leadership(), 1)).toEqual({ ok: false, error: { code: 'project-closed', name: 'Bridge' } });
	});
});
