import { container } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	ComponentType,
	EmbedBuilder,
	messageLink,
	MessageFlags,
	OverwriteType,
	PermissionFlagsBits,
	type ActionRow,
	type MessageActionRowComponent,
	type ButtonInteraction,
	type ModalSubmitInteraction,
	type OverwriteData,
	type RepliableInteraction,
	type TextChannel
} from 'discord.js';
import {
	allEmployees,
	describeError,
	notice,
	pinnedMessageCard,
	fail,
	getEmployee,
	recordRequestMessage,
	recordRequestsThread,
	requestEntry,
	type Actor,
	type Card,
	type Effect,
	type EvidenceFile,
	type Outcome,
	type PayMeError
} from '../core';
import { toActor } from './actor';
import { toEmbeds } from './embeds';
import { entryButtons } from './entry';
import { claimTicketButtonId, requestButtonRow } from './requestModal';
import { buttonRows, payoutActionButtons, settleButtons } from './payouts';
import { reviewButtons, reviewRow } from './review';

interface PrivateMessage {
	embeds?: EmbedBuilder[];
	components: ActionRowBuilder<ButtonBuilder>[];
}

type Handler<T extends Effect> = (effect: T, interaction: RepliableInteraction | null) => Promise<unknown>;
type Handlers = { [K in Effect['type']]: Handler<Extract<Effect, { type: K }>> };

/** Interactions acknowledged without a reply: their message shows the result, so anything else they say goes in a private follow-up. */
const acknowledged = new WeakSet<RepliableInteraction>();

const viewer = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];
const bot = [
	...viewer,
	PermissionFlagsBits.SendMessages,
	PermissionFlagsBits.EmbedLinks,
	PermissionFlagsBits.AttachFiles,
	PermissionFlagsBits.ManageMessages,
	PermissionFlagsBits.PinMessages,
	PermissionFlagsBits.CreatePublicThreads,
	PermissionFlagsBits.SendMessagesInThreads,
	PermissionFlagsBits.ManageThreads
];

const handlers: Handlers = {
	'private-reply': async (effect, interaction) => interaction && replyPrivately(interaction, effect.card),
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
		const content = effect.ping ? `<@${effect.employeeUserId}>` : undefined;
		await thread.send({ content, embeds: toEmbeds(effect.card), allowedMentions: { users: effect.ping ? [effect.employeeUserId] : [] } });
	},
	'post-request-entry': async (effect) => {
		const thread = await openRequestsThread(effect.employeeUserId);
		const message = await thread.send({
			embeds: toEmbeds(effect.card),
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
		const message = await channel.send({
			embeds: toEmbeds(effect.card),
			files: uploads(effect.files),
			components,
			allowedMentions: { parse: [] }
		});
		recordRequestMessage(container.payMe, effect.requestNumber, {
			round: effect.round,
			jobId: effect.jobId,
			channelId: channel.id,
			messageId: message.id
		});
	},
	'update-review-copies': async (effect) => {
		const components = reviewRow(entryLink(effect.requestNumber, effect.round));
		for (const copy of effect.messages) {
			const channel = await container.client.channels.fetch(copy.channelId);
			if (!channel?.isTextBased()) throw new Error(`Review Channel ${copy.channelId} is not a text channel`);
			await channel.messages.edit(copy.messageId, { content: null, embeds: toEmbeds(effect.card), components, allowedMentions: { parse: [] } });
		}
	},
	'show-payout': async (effect, interaction) => {
		if (!interaction) return;
		return replyPrivately(
			interaction,
			effect.card,
			effect.settleButtons ? settleButtons(effect.payoutNumber) : [],
			acknowledged.has(interaction)
		);
	},
	'show-payouts': async (effect, interaction) => interaction && replyPrivately(interaction, effect.card, payoutActionButtons(effect.actions)),
	'update-request-entry': async (effect) => {
		const entry = requestEntry(container.payMe, effect.requestNumber, effect.round);
		if (!entry) return;
		const thread = await container.client.channels.fetch(entry.channelId);
		if (!thread?.isThread()) throw new Error(`Requests Thread ${entry.channelId} is not a thread`);
		if (thread.archived) await thread.setArchived(false);
		await thread.messages.edit(entry.messageId, {
			embeds: toEmbeds(effect.card),
			components: reviewRow(entryButtons(effect.requestNumber, effect.actions)),
			allowedMentions: { parse: [] }
		});
	},
	'delete-review-copies': async (effect) => {
		for (const copy of effect.messages) {
			try {
				const channel = await container.client.channels.fetch(copy.channelId);
				if (channel?.isTextBased()) await channel.messages.delete(copy.messageId);
			} catch (error) {
				container.logger.warn(`Could not delete review copy ${copy.messageId} of R-${effect.requestNumber}`, error);
			}
		}
	},
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

/** Acknowledges a button, or a modal opened from one, whose result shows by updating its message. Anything else replies privately. */
export async function acknowledge(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
	if (interaction.isButton() || interaction.isFromMessage()) {
		await interaction.deferUpdate();
		acknowledged.add(interaction);
		return;
	}
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

export async function runOutcome(interaction: RepliableInteraction, outcome: Outcome<unknown>): Promise<void> {
	if (!outcome.ok) {
		await replyPrivately(interaction, notice(describeError(outcome.error), 'danger'));
		return;
	}
	await runEffects(outcome.effects, interaction);
}

type Step = Outcome<unknown> | null;

/** Runs `op` as the acting member, or replies with `refusal` outside a guild. `op` returns null when it has replied itself. */
export async function runAsActor(interaction: RepliableInteraction, refusal: PayMeError, op: (actor: Actor) => Step | Promise<Step>): Promise<void> {
	const actor = toActor(interaction);
	const outcome = actor ? await op(actor) : fail(refusal);
	if (outcome) await runOutcome(interaction, outcome);
}

/** Runs effects that have no interaction to reply to, such as those from listeners. Private replies are dropped. */
export async function runEffects(effects: Effect[], interaction: RepliableInteraction | null = null): Promise<void> {
	for (const effect of effects) await runEffect(interaction, effect);
}

function runEffect<T extends Effect>(interaction: RepliableInteraction | null, effect: T) {
	const handler = handlers[effect.type] as Handler<T>;
	return handler(effect, interaction);
}

/** Brings pinned messages posted before the Request payment and Claim ticket buttons existed up to date. */
export async function addMissingRequestButtons(): Promise<void> {
	for (const employee of allEmployees(container.payMe)) {
		if (!employee.channelId || !employee.pinnedMessageId) continue;
		try {
			const channel = await container.client.channels.fetch(employee.channelId);
			if (channel?.type !== ChannelType.GuildText) continue;
			const message = await channel.messages.fetch(employee.pinnedMessageId);
			const rows = message.components.filter(
				(component): component is ActionRow<MessageActionRowComponent> => component.type === ComponentType.ActionRow
			);
			if (rows.some((row) => row.components.some((button) => button.customId === claimTicketButtonId))) continue;
			const card = pinnedMessageCard(employee.userId, employee.minecraftName);
			await message.edit({ content: null, embeds: toEmbeds(card), components: [requestButtonRow()], allowedMentions: { parse: [] } });
		} catch (error) {
			container.logger.warn(`Could not add the Request payment button for ${employee.userId}`, error);
		}
	}
}

async function startRequestsThread(channel: TextChannel, employeeUserId: string, pinnedMessage: Card, threadName: string) {
	const message = await channel.send({ embeds: toEmbeds(pinnedMessage), components: [requestButtonRow()], allowedMentions: { parse: [] } });
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

/** Replies privately, or with `update`, replaces the message the interaction came from, following up with any overflow. */
async function replyPrivately(interaction: RepliableInteraction, card: Card, buttons: ButtonBuilder[] = [], update = false) {
	const messages: PrivateMessage[] = toEmbeds(card).map((embed) => ({ embeds: [embed], components: [] }));
	const [first = [], ...rest] = chunk(buttons, 25).map(buttonRows);
	messages[messages.length - 1].components = first;
	messages.push(...rest.map((components) => ({ components })));
	for (const message of messages) {
		if (update && !interaction.replied) await interaction.editReply({ ...message, allowedMentions: { parse: [] } });
		else await sendPrivately(interaction, message);
	}
}

function sendPrivately(interaction: RepliableInteraction, message: PrivateMessage) {
	const options = { ...message, allowedMentions: { parse: [] } };
	if (interaction.replied || acknowledged.has(interaction)) return interaction.followUp({ ...options, flags: MessageFlags.Ephemeral });
	if (interaction.deferred) return interaction.editReply(options);
	return interaction.reply({ ...options, flags: MessageFlags.Ephemeral });
}

function chunk<T>(items: readonly T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
	return chunks;
}
