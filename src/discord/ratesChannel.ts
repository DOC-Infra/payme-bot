import { container } from '@sapphire/framework';
import type { EmbedBuilder } from 'discord.js';
import { postedRates, rateCards, ratesChannelId, recordPostedRates, type PostedRates } from '../core';
import { toEmbeds } from './embeds';
import { payMeFor } from './servers';

/** How long to wait after a change before editing the Rates Channel, so a burst of changes makes one edit. */
const refreshDelayMs = 2000;
/** Discord allows at most 10 embeds and 6000 characters of embed text in one message. */
const embedsPerMessage = 10;
const charactersPerMessage = 6000;

interface RatesState {
	shown: string;
	pending: NodeJS.Timeout | null;
	running: Promise<void>;
}

/** Each server's Rates Channel state, by server ID. */
const states = new Map<string, RatesState>();

function stateOf(guildId: string): RatesState {
	let state = states.get(guildId);
	if (!state) states.set(guildId, (state = { shown: '', pending: null, running: Promise.resolve() }));
	return state;
}

/** Brings the server's Rates Channel up to date shortly, once, however many changes ask for it in the meantime. */
export function scheduleRatesRefresh(guildId: string): void {
	const state = stateOf(guildId);
	if (state.pending) return;
	state.pending = setTimeout(() => {
		state.pending = null;
		state.running = state.running
			.then(() => refreshRates(guildId))
			.catch((error: unknown) => container.logger.warn(`Could not refresh the Rates Channel on server ${guildId}`, error));
	}, refreshDelayMs);
}

/**
 * Posts every Job's Rates in the Rates Channel, editing the messages PayMe posted before and deleting any it no longer needs. When
 * the Rates Channel moved or was unset, deletes the messages from the old one.
 */
export async function refreshRates(guildId: string): Promise<void> {
	const payMe = payMeFor(guildId);
	const state = stateOf(guildId);
	const channelId = ratesChannelId(payMe);
	const pages = channelId ? toPages(rateCards(payMe).flatMap(toEmbeds)) : [];
	const wanted = JSON.stringify({ channelId, pages: pages.map((page) => page.map((embed) => embed.toJSON())) });
	if (wanted === state.shown) return;

	let posted = postedRates(payMe);
	if (posted && posted.channelId !== channelId) {
		await deleteMessages(posted, posted.messageIds);
		recordPostedRates(payMe, null);
		posted = null;
	}
	if (!channelId) {
		state.shown = wanted;
		return;
	}

	const channel = await container.client.channels.fetch(channelId).catch(() => null);
	if (!channel?.isSendable()) throw new Error(`Rates Channel ${channelId} is not a channel PayMe can send to`);
	const messageIds: string[] = [];
	for (const [index, embeds] of pages.entries()) {
		const content = { content: null, embeds, allowedMentions: { parse: [] } };
		const existing = posted?.messageIds[index];
		const edited = existing ? await channel.messages.edit(existing, content).catch(() => null) : null;
		messageIds.push((edited ?? (await channel.send({ ...content, content: undefined }))).id);
	}
	if (posted) await deleteMessages(posted, posted.messageIds.slice(pages.length));
	recordPostedRates(payMe, { channelId, messageIds });
	state.shown = wanted;
}

function toPages(embeds: readonly EmbedBuilder[]): EmbedBuilder[][] {
	const pages: EmbedBuilder[][] = [];
	let characters = 0;
	for (const embed of embeds) {
		const size = embedLength(embed);
		const page = pages[pages.length - 1];
		if (!page || page.length === embedsPerMessage || characters + size > charactersPerMessage) {
			pages.push([embed]);
			characters = size;
		} else {
			page.push(embed);
			characters += size;
		}
	}
	return pages;
}

function embedLength(embed: EmbedBuilder): number {
	const { title = '', description = '', footer } = embed.data;
	return title.length + description.length + (footer?.text.length ?? 0);
}

async function deleteMessages(posted: PostedRates, messageIds: readonly string[]) {
	if (messageIds.length === 0) return;
	const channel = await container.client.channels.fetch(posted.channelId).catch(() => null);
	if (!channel?.isTextBased()) return;
	for (const messageId of messageIds) {
		await channel.messages
			.delete(messageId)
			.catch((error: unknown) => container.logger.warn(`Could not delete Rates message ${messageId}`, error));
	}
}
