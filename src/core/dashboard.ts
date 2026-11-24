import type { Card } from './effects';
import { allJobs } from './jobs';
import { payoutLabel } from './labels';
import type { PayMe } from './payme';
import { owedSummary } from './payouts';
import { allProjects, balanceOf, budgetOf } from './projects';
import { formatAmount } from './rates';

/** The summary at the top of the Leadership dashboard: what waits for review, what is owed, and the Open Projects. */
export function dashboardCard(payMe: PayMe): Card {
	const pending = payMe.requests.loadMany({ states: ['pending'] });
	const owed = owedSummary(payMe);

	const jobLines = allJobs(payMe).flatMap((job) => {
		const waiting = pending.filter((request) => request.eligibleJobIds.includes(job.id)).length;
		const toPay = owed.byJob.get(job.id) ?? 0;
		if (job.retired && waiting === 0 && toPay === 0) return [];
		return [`- **${job.name}**: ${plural(waiting, 'request')} pending review, ${formatAmount(toPay)} to pay`];
	});
	const openPayouts = owed.openPayouts.map(
		(payout) => `- **${payoutLabel(payout.number)}** ${payout.minecraftName}: ${formatAmount(payout.total)}, waiting to be marked paid`
	);
	const projects = allProjects(payMe)
		.filter((project) => project.state === 'open')
		.map((project) => `- **${project.name}**: ${formatAmount(balanceOf(project))} left of ${formatAmount(budgetOf(project))}`);

	const toPay =
		owed.employees === 0
			? 'Nobody is owed anything outside an Open Payout.'
			: `About **${formatAmount(owed.total)}** for ${plural(owed.employees, 'Employee')}, estimated at current Rates.`;
	const description = [
		`**Pending review**: ${plural(pending.length, 'request')}`,
		...jobLines,
		'',
		`**To pay**: ${toPay}`,
		...openPayouts,
		'',
		'**Open Projects**',
		...(projects.length ? projects : ['None.'])
	].join('\n');
	return { tone: 'info', title: 'PayMe dashboard', description, footer: 'Updates as requests, Payouts and Projects change.' };
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
