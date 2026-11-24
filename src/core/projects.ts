import { selectOpenPayout } from '../storage/payouts';
import {
	insertFunding,
	insertProject,
	insertShare,
	markProjectClosed,
	markShareRemoved,
	selectProject,
	selectProjectIdByName,
	selectProjects,
	selectShare,
	updateShare
} from '../storage/projects';
import type { Actor } from './actor';
import { notice, type Card, type Effect, type ProjectAction } from './effects';
import { getEmployee } from './employees';
import { jobsHeldBy, jobsManagedBy, managesJob } from './job-membership';
import { getJob, type Job } from './jobs';
import { projectStateName, shareLabel, type ProjectState } from './labels';
import { fail, succeed, type Failure, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { isLeadership, requireLeadership } from './permissions';
import { formatAmount, parseRate } from './rates';
import { maxFormOptions } from './tasks';

export interface Funding {
	amount: number;
	actorUserId: string;
	at: string;
}

export interface Share {
	id: number;
	projectId: number;
	/** The Project's Job, which the Share's Payout line belongs to. */
	jobId: number;
	employeeUserId: string;
	amount: number;
	note: string | null;
	actorUserId: string;
	paid: boolean;
	at: string;
}

export interface Project {
	id: number;
	name: string;
	jobId: number;
	state: ProjectState;
	createdBy: string;
	funding: Funding[];
	shares: Share[];
}

export interface NewProject {
	name: string;
	jobId: number;
	budget: string;
}

export interface NewShare {
	amount: string;
	note: string | null;
}

export interface ShareChanges {
	amount?: string;
	note?: string;
}

export function getProject(payMe: PayMe, id: number): Project | null {
	return selectProject(payMe.storage, id);
}

export function allProjects(payMe: PayMe): Project[] {
	return selectProjects(payMe.storage);
}

/** Every amount Leadership has funded the Project with. */
export function budgetOf(project: Project): number {
	return sum(project.funding);
}

/** What is left of the budget to give as Shares. */
export function balanceOf(project: Project): number {
	return budgetOf(project) - sum(project.shares);
}

export function createProject(payMe: PayMe, actor: Actor, input: NewProject): Outcome<Project> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const budget = parseRate(input.budget);
	if (budget === null) return fail({ code: 'invalid-amount', amount: input.budget });

	const { storage } = payMe;
	return storage.transaction(() => {
		const job = getJob(payMe, input.jobId);
		if (!job) return fail({ code: 'job-not-found' });
		if (job.retired) return fail({ code: 'job-retired', name: job.name });
		if (selectProjectIdByName(storage, input.name) !== null) return fail({ code: 'project-name-taken', name: input.name });

		const id = insertProject(storage, { name: input.name, jobId: job.id, createdBy: actor.userId });
		insertFunding(storage, id, budget, actor.userId);
		const project = getProject(payMe, id)!;
		const reply = `Created the ${project.name} Project for the ${job.name} Job with a budget of ${formatAmount(budget)}.`;
		return succeed([{ type: 'private-reply', card: notice(reply) }], project);
	});
}

/** Adds to the Project's budget, for example for a new pay period. */
export function fundProject(payMe: PayMe, actor: Actor, id: number, amountText: string): Outcome<Project> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const amount = parseRate(amountText);
	if (amount === null) return fail({ code: 'invalid-amount', amount: amountText });

	return changeOpenProject(payMe, id, (project) => {
		insertFunding(payMe.storage, id, amount, actor.userId);
		return `Added ${formatAmount(amount)} to the ${project.name} Project. ${formatAmount(balanceOf(project) + amount)} is left to give.`;
	});
}

export function closeProject(payMe: PayMe, actor: Actor, id: number): Outcome<Project> {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;

	return changeOpenProject(payMe, id, (project) => {
		markProjectClosed(payMe.storage, id);
		const left = balanceOf(project);
		return `Closed the ${project.name} Project.${left > 0 ? ` ${formatAmount(left)} of its budget was never given.` : ''}`;
	});
}

/** Gives `employee` a Share of the Project's budget. It is owed at once and goes into their next Payout. */
export function giveShare(payMe: PayMe, actor: Actor, id: number, employee: Actor, input: NewShare): Outcome<Share> {
	const amount = parseRate(input.amount);
	if (amount === null) return fail({ code: 'invalid-amount', amount: input.amount });
	const note = input.note?.trim() || null;

	const { storage } = payMe;
	return storage.transaction(() => {
		const project = getProject(payMe, id);
		if (!project) return fail({ code: 'project-not-found' });
		if (project.state !== 'open') return fail({ code: 'project-closed', name: project.name });
		const job = getJob(payMe, project.jobId)!;
		if (!managesJob(payMe, actor, job)) return fail({ code: 'not-project-manager', job: job.name });
		const refused = refuseRecipient(payMe, employee, job);
		if (refused) return refused;
		const balance = balanceOf(project);
		if (amount > balance) return fail({ code: 'over-budget', name: project.name, balance });

		const shareId = insertShare(storage, { projectId: id, employeeUserId: employee.userId, amount, note, actorUserId: actor.userId });
		const share = getProject(payMe, id)!.shares.find((given) => given.id === shareId)!;
		const left = formatAmount(balance - amount);
		const reply = `Gave <@${employee.userId}> ${shareLabel(shareId)}, ${formatAmount(amount)} from the ${project.name} Project. ${left} is left to give.`;
		const effects: Effect[] = [
			{ type: 'post-to-requests-thread', employeeUserId: employee.userId, card: shareCard(project, share), ping: true },
			{ type: 'private-reply', card: notice(reply) }
		];
		return succeed(effects, share);
	});
}

/** Changes the amount or note of a Share that is not paid and not in an Open Payout. */
export function editShare(payMe: PayMe, actor: Actor, id: number, changes: ShareChanges): Outcome<Share> {
	const amount = changes.amount === undefined ? undefined : parseRate(changes.amount);
	if (amount === null) return fail({ code: 'invalid-amount', amount: changes.amount! });
	const note = changes.note?.trim() || undefined;
	if (amount === undefined && note === undefined) return fail({ code: 'share-edit-empty' });

	return changeShare(payMe, actor, id, ({ share, project }) => {
		const newAmount = amount ?? share.amount;
		const balance = balanceOf(project) + share.amount;
		if (newAmount > balance) return fail({ code: 'over-budget', name: project.name, balance });

		const changed = [
			newAmount !== share.amount && `amount from ${formatAmount(share.amount)} to **${formatAmount(newAmount)}**`,
			note !== undefined && note !== share.note && `note to "${note}"`
		].filter(Boolean);
		if (changed.length === 0) return fail({ code: 'share-edit-empty' });

		updateShare(payMe.storage, id, { amount: newAmount, note: note ?? share.note });
		const what = `changed its ${changed.join(' and ')}`;
		const left = formatAmount(balance - newAmount);
		return {
			log: `<@${actor.userId}> ${what}.`,
			reply: `Edited ${shareLabel(id)} for <@${share.employeeUserId}>: ${what}. ${left} is left to give in the ${project.name} Project.`
		};
	});
}

/** Removes a Share that is not paid and not in an Open Payout, returning its amount to the Project's budget. */
export function removeShare(payMe: PayMe, actor: Actor, id: number): Outcome<Share> {
	return changeShare(payMe, actor, id, ({ share, project }) => {
		markShareRemoved(payMe.storage, id);
		const left = formatAmount(balanceOf(project) + share.amount);
		return {
			log: `Removed by <@${actor.userId}>. It will not be paid.`,
			reply: `Removed ${shareLabel(id)}, ${formatAmount(share.amount)} for <@${share.employeeUserId}>. ${left} is left to give in the ${project.name} Project.`
		};
	});
}

interface ShareInProject {
	share: Share;
	project: Project;
}

/**
 * Checks that the actor may change the Share now, then runs `change`. Only Managers of the Project's Job, or Leadership, may,
 * and only while the Project is Open and the Share is neither paid nor locked in an Open Payout.
 */
function changeShare(
	payMe: PayMe,
	actor: Actor,
	id: number,
	change: (found: ShareInProject) => Failure | { log: string; reply: string }
): Outcome<Share> {
	const { storage } = payMe;
	return storage.transaction(() => {
		const share = selectShare(storage, id);
		if (!share) return fail({ code: 'share-not-found' });
		const project = getProject(payMe, share.projectId)!;
		const job = getJob(payMe, project.jobId)!;
		if (!managesJob(payMe, actor, job)) return fail({ code: 'not-project-manager', job: job.name });
		if (share.paid) return fail({ code: 'share-paid', id });
		if (project.state !== 'open') return fail({ code: 'project-closed', name: project.name });
		const open = selectOpenPayout(storage, share.employeeUserId);
		if (open?.shares.some((line) => line.shareId === id)) return fail({ code: 'share-in-payout', id, payoutNumber: open.number });

		const result = change({ share, project });
		if ('ok' in result) return result;
		const changed = selectShare(storage, id) ?? share;
		const card: Card = { tone: 'warning', title: `${shareLabel(id)} · ${project.name}`, description: result.log };
		const effects: Effect[] = [
			{ type: 'post-to-requests-thread', employeeUserId: share.employeeUserId, card, ping: true },
			{ type: 'private-reply', card: notice(result.reply) }
		];
		return succeed(effects, changed);
	});
}

function refuseRecipient(payMe: PayMe, employee: Actor, job: Job): Failure | null {
	const hired = getEmployee(payMe, employee.userId);
	if (!hired) return fail({ code: 'employee-not-found' });
	if (!hired.threadId) return fail({ code: 'employee-no-requests-thread' });
	const takesPart = managesJob(payMe, employee, job) || jobsHeldBy(payMe, employee).some((held) => held.id === job.id);
	if (!takesPart) return fail({ code: 'share-job-not-held', job: job.name });
	return null;
}

function shareCard(project: Project, share: Share): Card {
	return {
		tone: 'success',
		title: `${shareLabel(share.id)} · ${project.name}`,
		description: `**${formatAmount(share.amount)}** from the ${project.name} Project, given by <@${share.actorUserId}>. It will be paid in your next Payout.`,
		fields: share.note ? [{ name: 'Note', value: share.note }] : undefined
	};
}

/** Lists the Projects of the Jobs the actor manages: every Project for Leadership. */
export function listProjects(payMe: PayMe, actor: Actor): Outcome<Project[]> {
	if (jobsManagedBy(payMe, actor).length === 0) return fail({ code: 'not-permitted' });
	const projects = allProjects(payMe).filter((project) => canView(payMe, actor, project));

	const card: Card =
		projects.length === 0
			? notice('There are no Projects yet.', 'neutral')
			: { tone: 'info', title: 'Projects', description: projects.map((project) => summary(payMe, project)).join('\n') };
	const choices = [...projects]
		.sort((a, b) => Number(a.state !== 'open') - Number(b.state !== 'open'))
		.slice(0, maxFormOptions)
		.map((project) => ({ id: project.id, label: project.state === 'open' ? project.name : `${project.name} (closed)` }));
	return succeed([{ type: 'show-projects', card, projects: choices, canCreate: isLeadership(payMe, actor) }], projects);
}

export function showProject(payMe: PayMe, actor: Actor, id: number): Outcome<Project> {
	const project = getProject(payMe, id);
	if (!project) return fail({ code: 'project-not-found' });
	if (!canView(payMe, actor, project)) return fail({ code: 'not-project-manager', job: getJob(payMe, project.jobId)!.name });

	const funding = project.funding.map((entry) => `- ${formatAmount(entry.amount)} by <@${entry.actorUserId}> on ${entry.at.slice(0, 10)}`);
	const shares = project.shares.map((share) => `- ${shareText(share)}`);
	const card: Card = {
		tone: project.state === 'open' ? 'info' : 'neutral',
		title: `${project.name} Project`,
		description: ['**Funding**', ...funding, '', '**Shares**', ...(shares.length ? shares : ['None given yet.'])].join('\n'),
		fields: [
			{ name: 'Job', value: getJob(payMe, project.jobId)!.name, inline: true },
			{ name: 'Status', value: projectStateName(project.state), inline: true },
			{ name: 'Budget', value: formatAmount(budgetOf(project)), inline: true },
			{ name: 'Left to give', value: formatAmount(balanceOf(project)), inline: true }
		]
	};
	return succeed([{ type: 'show-project', projectId: id, card, actions: projectActions(payMe, actor, project) }], project);
}

/** The buttons a viewer gets on an Open Project: Shares for its Managers, funding and closing for Leadership. */
function projectActions(payMe: PayMe, actor: Actor, project: Project): ProjectAction[] {
	if (project.state !== 'open') return [];
	const actions: ProjectAction[] = ['share'];
	if (changeableShares(project).length > 0) actions.push('change-share');
	if (isLeadership(payMe, actor)) actions.push('fund', 'close');
	return actions;
}

/** The Project's Shares that have not been paid, most recent first: those a Manager may still try to change. */
export function changeableShares(project: Project): Share[] {
	return project.shares.filter((share) => !share.paid).reverse();
}

function shareText(share: Share): string {
	const note = share.note ? ` (${share.note})` : '';
	const status = share.paid ? 'Paid' : 'Owed';
	return `**${shareLabel(share.id)}** <@${share.employeeUserId}>: ${formatAmount(share.amount)}${note}, given by <@${share.actorUserId}>, ${status}`;
}

function summary(payMe: PayMe, project: Project): string {
	const job = getJob(payMe, project.jobId)!.name;
	const amounts = `${formatAmount(balanceOf(project))} left of ${formatAmount(budgetOf(project))}`;
	return `**${project.name}** (${job}), ${projectStateName(project.state)}: ${amounts}`;
}

function canView(payMe: PayMe, actor: Actor, project: Project): boolean {
	return managesJob(payMe, actor, getJob(payMe, project.jobId)!);
}

function changeOpenProject(payMe: PayMe, id: number, change: (project: Project) => string): Outcome<Project> {
	return payMe.storage.transaction(() => {
		const project = getProject(payMe, id);
		if (!project) return fail({ code: 'project-not-found' });
		if (project.state !== 'open') return fail({ code: 'project-closed', name: project.name });

		const reply = change(project);
		return succeed([{ type: 'private-reply', card: notice(reply) }], getProject(payMe, id)!);
	});
}

function sum(entries: readonly { amount: number }[]): number {
	return entries.reduce((total, entry) => total + entry.amount, 0);
}
