import { saveSetting, selectSetting } from '../storage/settings';
import type { Actor } from './actor';
import { notice, type Card } from './effects';
import { allJobs } from './jobs';
import { succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { requireLeadership } from './permissions';
import { formatAmount } from './rates';
import { allTasks, type Task } from './tasks';

const channelKey = 'rates-channel';
const postedKey = 'rates-channel-messages';

/** Where PayMe last posted the Rates Channel's messages, so it can edit them in place. */
export interface PostedRates {
	channelId: string;
	messageIds: string[];
}

export function ratesChannelId(payMe: PayMe): string | null {
	return selectSetting(payMe.storage, channelKey);
}

/** Makes the channel the Rates Channel, where PayMe keeps every Job's Tasks and Rates posted. */
export function setRatesChannel(payMe: PayMe, actor: Actor, channelId: string): Outcome {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	saveSetting(payMe.storage, channelKey, channelId);
	return succeed([{ type: 'private-reply', card: notice(`<#${channelId}> is now the Rates Channel. PayMe will post the Rates there shortly.`) }]);
}

/** Stops keeping the Rates posted. PayMe deletes the messages it posted. */
export function unsetRatesChannel(payMe: PayMe, actor: Actor): Outcome {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	const channelId = ratesChannelId(payMe);
	saveSetting(payMe.storage, channelKey, null);
	const reply = channelId ? `<#${channelId}> is no longer the Rates Channel.` : 'There is no Rates Channel.';
	return succeed([{ type: 'private-reply', card: notice(reply, channelId ? 'success' : 'neutral') }]);
}

export function postedRates(payMe: PayMe): PostedRates | null {
	const value = selectSetting(payMe.storage, postedKey);
	return value ? (JSON.parse(value) as PostedRates) : null;
}

export function recordPostedRates(payMe: PayMe, posted: PostedRates | null) {
	saveSetting(payMe.storage, postedKey, posted ? JSON.stringify(posted) : null);
}

/** One card per active Job, listing its active Tasks with their Rates. */
export function rateCards(payMe: PayMe): Card[] {
	const tasks = allTasks(payMe).filter((task) => !task.retired);
	const jobs = allJobs(payMe).filter((job) => !job.retired);
	if (jobs.length === 0) return [notice('There are no Jobs yet.', 'neutral')];

	return jobs.map((job) => {
		const lines = tasks.filter((task) => task.jobIds.includes(job.id)).map(rateLine);
		return { tone: 'info', title: `${job.name} Rates`, description: lines.length ? lines.join('\n') : 'No Tasks yet.' };
	});
}

function rateLine(task: Task): string {
	return `**${task.name}**: ${formatAmount(task.rate)}`;
}
