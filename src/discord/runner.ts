import { container } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	messageLink,
	MessageFlags,
	OverwriteType,
	PermissionFlagsBits,
	type OverwriteData,
	type RepliableInteraction,
	type TextChannel
} from 'discord.js';
import {
	describeError,
	getEmployee,
	getPaymentRequest,
	getPayout,
	recordRequestMessage,
	recordRequestsThread,
	requestEntry,
	type Effect,
	type EvidenceFile,
	type Outcome
} from '../core';
import { entryButtons } from './entry';
import { buttonRows, payoutActionButtons, settleButtons } from './payouts';
import { reviewButtons, reviewRow } from './review';

type Handler<T extends Effect> = (effect: T, interaction: RepliableInteraction | null) => Promise<unknown>;
type Handlers = { [K in Effect['type']]: Handler<Extract<Effect, { type: K }>> };

const viewer = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];
const bot = [
	...viewer,
	PermissionFlagsBits.SendMessages,
	PermissionFlagsBits.ManageMessages,
	PermissionFlagsBits.CreatePublicThreads,
	PermissionFlagsBits.SendMessagesInThreads,
	PermissionFlagsBits.ManageThreads
];

const handlers: Handlers = {
	'private-reply': async (effect, interaction) => interaction && replyPrivately(interaction, effect.content),
	'create-employee-channel': async (effect) => {
		const guild = await container.client.guilds.fetch(container.config.guildId);
		const overwrites: OverwriteData[] = [
			{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
			{ id: container.client.user!.id, type: OverwriteType.Member, allow: bot },
			...effect.viewerUserIds.map((id) => ({ id, type: OverwriteType.Member, allow: viewer })),
			...effect.viewerRoleIds.map((id) => ({ id, type: OverwriteType.Role, allow: viewer }))
		];
		const channel = await guild.channels.create({
			name: effect.name,
			type: ChannelType.GuildText,
			parent: container.config.employeeChannelCategoryId,
			permissionOverwrites: overwrites
		});
		await startRequestsThread(channel, effect.employeeUserId, effect.pinnedMessage, effect.threadName);
	},
	'start-requests-thread': async (effect) => {
		const channel = await container.client.channels.fetch(effect.channelId);
		if (channel?.type !== ChannelType.GuildText) throw new Error(`Channel ${effect.channelId} is not a text channel`);
		await startRequestsThread(channel, effect.employeeUserId, effect.pinnedMessage, effect.threadName);
	},
	'grant-channel-access': async (effect) => {
		const channel = await container.client.channels.fetch(effect.channelId);
		if (!channel || channel.isDMBased() || channel.isThread()) throw new Error(`Channel ${effect.channelId} is not a guild channel`);
		for (const roleId of effect.roleIds) await channel.permissionOverwrites.edit(roleId, { ViewChannel: true, ReadMessageHistory: true });
	},
	'post-to-requests-thread': async (effect) => {
		const thread = await openRequestsThread(effect.employeeUserId);
		const content = effect.ping ? `<@${effect.employeeUserId}> ${effect.content}` : effect.content;
		await thread.send({ content, allowedMentions: { users: effect.ping ? [effect.employeeUserId] : [] } });
	},
	'post-request-entry': async (effect) => {
		const thread = await openRequestsThread(effect.employeeUserId);
		const message = await thread.send({
			content: effect.content,
			files: uploads(effect.files),
			components: reviewRow(entryButtons(effect.requestNumber, effect.actions)),
			allowedMentions: { parse: [] }
		});
		recordRequestMessage(container.payMe, effect.requestNumber, {
			round: effect.round,
			jobId: null,
			channelId: thread.id,
			messageId: message.id
		});
	},
	'post-review-message': async (effect) => {
		const channel = await container.client.channels.fetch(effect.channelId);
		if (!channel?.isSendable()) throw new Error(`Review Channel ${effect.channelId} is not a channel PayMe can send to`);

		const components = reviewRow([...entryLink(effect.requestNumber, effect.round), ...reviewButtons(effect.requestNumber)]);
		const message = await channel.send({ content: effect.content, files: uploads(effect.files), components, allowedMentions: { parse: [] } });
		recordRequestMessage(container.payMe, effect.requestNumber, {
			round: effect.round,
			jobId: effect.jobId,
			channelId: channel.id,
			messageId: message.id
		});
	},
	'update-review-copies': async (effect) => {
		const copies = getPaymentRequest(container.payMe, effect.requestNumber)?.messages ?? [];
		const components = reviewRow(entryLink(effect.requestNumber, effect.round));
		for (const copy of copies) {
			if (copy.jobId === null || copy.round !== effect.round) continue;
			const channel = await container.client.channels.fetch(copy.channelId);
			if (!channel?.isTextBased()) throw new Error(`Review Channel ${copy.channelId} is not a text channel`);
			await channel.messages.edit(copy.messageId, { content: effect.content, components, allowedMentions: { parse: [] } });
		}
	},
	'show-payout': async (effect, interaction) => {
		const open = getPayout(container.payMe, effect.payoutNumber)?.state === 'open';
		return interaction && replyPrivately(interaction, effect.content, buttonRows(open ? settleButtons(effect.payoutNumber) : []));
	},
	'show-payouts': async (effect, interaction) =>
		interaction && replyPrivately(interaction, effect.content, buttonRows(payoutActionButtons(effect.actions))),
	'update-entry-actions': async (effect) => {
		const entry = requestEntry(container.payMe, effect.requestNumber, effect.round);
		if (!entry) return;
		const thread = await container.client.channels.fetch(entry.channelId);
		if (!thread?.isThread()) throw new Error(`Requests Thread ${entry.channelId} is not a thread`);
		if (thread.archived) await thread.setArchived(false);
		await thread.messages.edit(entry.messageId, { components: reviewRow(entryButtons(effect.requestNumber, effect.actions)) });
	}
};

function entryLink(requestNumber: number, round: number): ButtonBuilder[] {
	const entry = requestEntry(container.payMe, requestNumber, round);
	if (!entry) return [];
	const url = messageLink(entry.channelId, entry.messageId, container.config.guildId);
	return [new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open in Requests Thread').setURL(url)];
}

export async function runOutcome(interaction: RepliableInteraction, outcome: Outcome<unknown>): Promise<void> {
	if (!outcome.ok) {
		await replyPrivately(interaction, describeError(outcome.error));
		return;
	}
	await runEffects(outcome.effects, interaction);
}

/** Runs effects that have no interaction to reply to, such as those from listeners. Private replies are dropped. */
export async function runEffects(effects: Effect[], interaction: RepliableInteraction | null = null): Promise<void> {
	for (const effect of effects) await runEffect(interaction, effect);
}

function runEffect<T extends Effect>(interaction: RepliableInteraction | null, effect: T) {
	const handler = handlers[effect.type] as Handler<T>;
	return handler(effect, interaction);
}

async function startRequestsThread(channel: TextChannel, employeeUserId: string, pinnedMessage: string, threadName: string) {
	const message = await channel.send({ content: pinnedMessage, allowedMentions: { parse: [] } });
	await message.pin();
	const thread = await message.startThread({ name: threadName });
	recordRequestsThread(container.payMe, employeeUserId, { channelId: channel.id, pinnedMessageId: message.id, threadId: thread.id });
}

async function openRequestsThread(employeeUserId: string) {
	const threadId = getEmployee(container.payMe, employeeUserId)?.threadId;
	if (!threadId) throw new Error(`Employee ${employeeUserId} has no Requests Thread`);

	const thread = await container.client.channels.fetch(threadId);
	if (!thread?.isThread()) throw new Error(`Requests Thread ${threadId} is not a thread`);
	if (thread.archived) await thread.setArchived(false);
	return thread;
}

function uploads(files: readonly EvidenceFile[]) {
	return files.map((file) => ({ attachment: file.url, name: file.name }));
}

function replyPrivately(interaction: RepliableInteraction, content: string, components: ActionRowBuilder<ButtonBuilder>[] = []) {
	const message = { content, components, allowedMentions: { parse: [] } };
	if (interaction.replied) return interaction.followUp({ ...message, flags: MessageFlags.Ephemeral });
	if (interaction.deferred) return interaction.editReply(message);
	return interaction.reply({ ...message, flags: MessageFlags.Ephemeral });
}
