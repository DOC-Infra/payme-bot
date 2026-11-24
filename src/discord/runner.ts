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
	PermissionsBitField,
	type PermissionsString,
	type ActionRow,
	type MessageActionRowComponent,
	type MessageActionRowComponentBuilder,
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
	recordRequestsThread,
	carryOutRound,
	employeeCategoryId,
	requestEntry,
	type Actor,
	type Card,
	type Effect,
	type EvidenceFile,
	type MessageRef,
	type Outcome,
	type PayMe,
	type PayMeError,
	type PostRound,
	type RoundPoster
} from '../core';
import { fetchActorIn, toActor } from './actor';
import { scheduleDashboardRefresh } from './dashboard';
import { scheduleRatesRefresh } from './ratesChannel';
import { toEmbeds } from './embeds';
import { entryButtons } from './entry';
import { decodeCustomId } from './customIds';
import { requestButtonRow } from './requestModal';
import { buttonRows, payoutActionButtons, settleButtons } from './payouts';
import { manageComponents } from './manage';
import { newProjectButton, projectActionButtons, projectSelectRow } from './projects';
import { employeeCategory } from './paymentReview';
import { reviewButtons, reviewRow } from './review';
import { payMeFor } from './servers';

type ComponentRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

interface PrivateMessage {
	embeds?: EmbedBuilder[];
	components: ComponentRow[];
}

/** Which server the effects belong to, its PayMe, and the interaction to reply to, if any. */
export interface EffectContext {
	guildId: string;
	payMe: PayMe;
	interaction: RepliableInteraction | null;
}

type Handler<T extends Effect> = (effect: T, context: EffectContext) => Promise<unknown>;
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

/** The permissions as an overwrite that allows each of them. */
function allowing(flags: readonly bigint[]): Partial<Record<PermissionsString, true>> {
	return Object.fromEntries(new PermissionsBitField(flags).toArray().map((name) => [name, true]));
}

const handlers: Handlers = {
	'private-reply': async (effect, { interaction }) => interaction && replyPrivately(interaction, effect.card),
	'create-employee-channel': async (effect, { guildId, payMe }) => {
		const guild = await container.client.guilds.fetch(guildId);
		const overwrites: OverwriteData[] = [
			{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
			{ id: container.client.user!.id, type: OverwriteType.Member, allow: bot },
			...effect.viewerUserIds.map((id) => ({ id, type: OverwriteType.Member, allow: viewer })),
			...effect.viewerRoleIds.map((id) => ({ id, type: OverwriteType.Role, allow: viewer }))
		];
		const channel = await guild.channels.create({
			name: effect.name,
			type: ChannelType.GuildText,
			parent: (await employeeCategory(guild, employeeCategoryId(payMe))).id,
			permissionOverwrites: overwrites
		});
		await startRequestsThread(payMe, channel, effect.employeeUserId, effect.pinnedMessage, effect.threadName);
	},
	'start-requests-thread': async (effect, { payMe }) => {
		const channel = await container.client.channels.fetch(effect.channelId);
		if (channel?.type !== ChannelType.GuildText) throw new Error(`Channel ${effect.channelId} is not a text channel`);
		await startRequestsThread(payMe, channel, effect.employeeUserId, effect.pinnedMessage, effect.threadName);
	},
	'grant-channel-access': async (effect) => {
		const channel = await container.client.channels.fetch(effect.channelId);
		if (!channel || channel.isDMBased() || channel.isThread()) throw new Error(`Channel ${effect.channelId} is not a guild channel`);
		for (const roleId of effect.roleIds) await channel.permissionOverwrites.edit(roleId, { ViewChannel: true, ReadMessageHistory: true });
	},
	'sync-employee-channel': async (effect) => {
		const channel = await container.client.channels.fetch(effect.channelId);
		if (channel?.type !== ChannelType.GuildText) throw new Error(`Channel ${effect.channelId} is not a text channel`);
		const { permissionOverwrites } = channel;
		const everyoneId = channel.guild.roles.everyone.id;
		const viewers = new Set(effect.viewerRoleIds);
		const otherRoles = permissionOverwrites.cache.filter(
			(overwrite) =>
				overwrite.type === OverwriteType.Role &&
				overwrite.id !== everyoneId &&
				!viewers.has(overwrite.id) &&
				overwrite.allow.has(PermissionFlagsBits.ViewChannel)
		);

		// PayMe lets itself in first, so hiding the channel from @everyone never locks it out.
		await permissionOverwrites.edit(container.client.user!.id, allowing(bot), { type: OverwriteType.Member });
		await permissionOverwrites.edit(effect.employeeUserId, allowing(viewer), { type: OverwriteType.Member });
		for (const roleId of viewers) await permissionOverwrites.edit(roleId, allowing(viewer), { type: OverwriteType.Role });
		for (const roleId of otherRoles.keys()) await permissionOverwrites.edit(roleId, { ViewChannel: null }, { type: OverwriteType.Role });
		await permissionOverwrites.edit(everyoneId, { ViewChannel: false }, { type: OverwriteType.Role });
	},
	'revoke-channel-access': async (effect) => {
		const channel = await container.client.channels.fetch(effect.channelId);
		if (!channel || channel.isDMBased() || channel.isThread()) throw new Error(`Channel ${effect.channelId} is not a guild channel`);
		for (const roleId of effect.roleIds) await channel.permissionOverwrites.delete(roleId);
	},
	'rename-channel': async (effect) => {
		const channel = await container.client.channels.fetch(effect.channelId);
		if (!channel || channel.isDMBased() || channel.isThread()) throw new Error(`Channel ${effect.channelId} is not a guild channel`);
		await channel.setName(effect.name);
	},
	'post-to-requests-thread': async (effect, { payMe }) => {
		const thread = await openRequestsThread(payMe, effect.employeeUserId);
		const content = effect.ping ? `<@${effect.employeeUserId}>` : undefined;
		await thread.send({ content, embeds: toEmbeds(effect.card), allowedMentions: { users: effect.ping ? [effect.employeeUserId] : [] } });
	},
	'post-round': async (effect, context) => carryOutRound(effect, roundPoster(context), context.payMe.requests),
	'update-review-copies': async (effect, context) => {
		const components = reviewRow(entryLink(context, effect.requestNumber, effect.round));
		for (const copy of effect.messages) {
			const channel = await container.client.channels.fetch(copy.channelId);
			if (!channel?.isTextBased()) throw new Error(`Review Channel ${copy.channelId} is not a text channel`);
			await channel.messages.edit(copy.messageId, { content: null, embeds: toEmbeds(effect.card), components, allowedMentions: { parse: [] } });
		}
	},
	'show-payout': async (effect, { interaction }) => {
		if (!interaction) return;
		return replyPrivately(
			interaction,
			effect.card,
			effect.settleButtons ? settleButtons(effect.payoutNumber) : [],
			acknowledged.has(interaction)
		);
	},
	'show-payouts': async (effect, { interaction }) => interaction && replyPrivately(interaction, effect.card, payoutActionButtons(effect.actions)),
	'show-project': async (effect, { interaction }) =>
		interaction && replyPrivately(interaction, effect.card, projectActionButtons(effect.projectId, effect.actions)),
	'show-manage': async (effect, { interaction }) => {
		if (!interaction) return;
		const { menus, buttons } = manageComponents(effect.view);
		return replyPrivately(interaction, effect.card, buttons, false, menus);
	},
	'show-projects': async (effect, { interaction }) => {
		if (!interaction) return;
		const menu: ComponentRow[] = effect.projects.length > 0 ? [projectSelectRow(effect.projects)] : [];
		return replyPrivately(interaction, effect.card, effect.canCreate ? [newProjectButton()] : [], false, menu);
	},
	'update-request-entry': async (effect, { payMe }) => {
		const entry = requestEntry(payMe, effect.requestNumber, effect.round);
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
	'update-entry-actions': async (effect, { payMe }) => {
		const entry = requestEntry(payMe, effect.requestNumber, effect.round);
		if (!entry) return;
		const thread = await container.client.channels.fetch(entry.channelId);
		if (!thread?.isThread()) throw new Error(`Requests Thread ${entry.channelId} is not a thread`);
		if (thread.archived) await thread.setArchived(false);
		await thread.messages.edit(entry.messageId, { components: reviewRow(entryButtons(effect.requestNumber, effect.actions)) });
	}
};

function roundPoster({ guildId, payMe }: EffectContext): RoundPoster {
	return {
		postEntry: (round) => postRequestEntry(payMe, round),
		postReviewCopy: (round, channelId, entry) => postReviewCopy(round, channelId, entryLinkButton(guildId, entry))
	};
}

async function postRequestEntry(payMe: PayMe, round: PostRound): Promise<MessageRef> {
	const thread = await openRequestsThread(payMe, round.employeeUserId);
	const message = await thread.send({
		embeds: toEmbeds(round.entryCard),
		files: uploads(round.files),
		components: reviewRow(entryButtons(round.requestNumber, round.actions)),
		allowedMentions: { parse: [] }
	});
	return { channelId: thread.id, messageId: message.id };
}

async function postReviewCopy(round: PostRound, channelId: string, link: ButtonBuilder): Promise<MessageRef> {
	const channel = await container.client.channels.fetch(channelId);
	if (!channel?.isSendable()) throw new Error(`Review Channel ${channelId} is not a channel PayMe can send to`);

	const message = await channel.send({
		embeds: toEmbeds(round.reviewCard),
		files: uploads(round.files),
		components: reviewRow([link, ...reviewButtons(round.requestNumber)]),
		allowedMentions: { parse: [] }
	});
	return { channelId: channel.id, messageId: message.id };
}

function entryLink({ guildId, payMe }: EffectContext, requestNumber: number, round: number): ButtonBuilder[] {
	const entry = requestEntry(payMe, requestNumber, round);
	return entry ? [entryLinkButton(guildId, entry)] : [];
}

function entryLinkButton(guildId: string, entry: MessageRef): ButtonBuilder {
	const url = messageLink(entry.channelId, entry.messageId, guildId);
	return new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open in Requests Thread').setURL(url);
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

/** Replies with the failure, or runs the effects in `guildId`'s server: the interaction's own unless it is filed elsewhere. */
export async function runOutcome(
	interaction: RepliableInteraction,
	outcome: Outcome<unknown>,
	guildId: string | null = interaction.guildId
): Promise<void> {
	if (!outcome.ok || !guildId) {
		if (!outcome.ok) await replyPrivately(interaction, notice(describeError(outcome.error), 'danger'));
		return;
	}
	await runEffects(outcome.effects, { guildId, payMe: payMeFor(guildId), interaction });
	// A deferred reply nothing filled would stay as "thinking" forever.
	if (interaction.deferred && !interaction.replied && !acknowledged.has(interaction)) await interaction.deleteReply();
}

type Step = Outcome<unknown> | null;

/**
 * Runs `op` as the acting member with their server's PayMe, or replies with `refusal` outside a server. With `home`, the server is
 * that one instead, and the actor has the roles and permissions they have there: for PayMe used as a user app outside its servers.
 * `op` returns null when it has replied itself.
 */
export async function runAsActor(
	interaction: RepliableInteraction,
	refusal: PayMeError,
	op: (actor: Actor, payMe: PayMe) => Step | Promise<Step>,
	home: string | null = interaction.guildId
): Promise<void> {
	const actor = home && home !== interaction.guildId ? await fetchActorIn(home, interaction.user.id) : toActor(interaction);
	const outcome = actor && home ? await op(actor, payMeFor(home)) : fail(refusal);
	if (outcome) await runOutcome(interaction, outcome, home);
}

/** Runs the server's effects. Without an interaction, such as from a listener, private replies are dropped. */
export async function runEffects(effects: Effect[], context: EffectContext): Promise<void> {
	for (const effect of effects) await runEffect(context, effect);
	scheduleDashboardRefresh(context.guildId);
	scheduleRatesRefresh(context.guildId);
}

function runEffect<T extends Effect>(context: EffectContext, effect: T) {
	const handler = handlers[effect.type] as Handler<T>;
	return handler(effect, context);
}

/** Brings the server's pinned messages posted before the Request payment and Claim ticket buttons existed up to date. */
export async function addMissingRequestButtons(payMe: PayMe): Promise<void> {
	for (const employee of allEmployees(payMe)) {
		if (!employee.channelId || !employee.pinnedMessageId) continue;
		try {
			const channel = await container.client.channels.fetch(employee.channelId);
			if (channel?.type !== ChannelType.GuildText) continue;
			const message = await channel.messages.fetch(employee.pinnedMessageId);
			const rows = message.components.filter(
				(component): component is ActionRow<MessageActionRowComponent> => component.type === ComponentType.ActionRow
			);
			if (rows.some((row) => row.components.some((button) => decodeCustomId(button.customId ?? '')?.kind === 'claim-ticket-button'))) continue;
			const card = pinnedMessageCard(employee.userId, employee.minecraftName);
			await message.edit({ content: null, embeds: toEmbeds(card), components: [requestButtonRow()], allowedMentions: { parse: [] } });
		} catch (error) {
			container.logger.warn(`Could not add the Request payment button for ${employee.userId}`, error);
		}
	}
}

async function startRequestsThread(payMe: PayMe, channel: TextChannel, employeeUserId: string, pinnedMessage: Card, threadName: string) {
	const message = await channel.send({ embeds: toEmbeds(pinnedMessage), components: [requestButtonRow()], allowedMentions: { parse: [] } });
	await message.pin();
	const thread = await message.startThread({ name: threadName });
	recordRequestsThread(payMe, employeeUserId, { channelId: channel.id, pinnedMessageId: message.id, threadId: thread.id });
}

async function openRequestsThread(payMe: PayMe, employeeUserId: string) {
	const threadId = getEmployee(payMe, employeeUserId)?.threadId;
	if (!threadId) throw new Error(`Employee ${employeeUserId} has no Requests Thread`);

	const thread = await container.client.channels.fetch(threadId);
	if (!thread?.isThread()) throw new Error(`Requests Thread ${threadId} is not a thread`);
	if (thread.archived) await thread.setArchived(false);
	return thread;
}

function uploads(files: readonly EvidenceFile[]) {
	return files.map((file) => ({ attachment: file.url, name: file.name }));
}

/**
 * Replies privately, or with `update`, replaces the message the interaction came from, following up with any overflow. `menus` go
 * above the buttons on the last message.
 */
async function replyPrivately(
	interaction: RepliableInteraction,
	card: Card,
	buttons: ButtonBuilder[] = [],
	update = false,
	menus: ComponentRow[] = []
) {
	const messages: PrivateMessage[] = toEmbeds(card).map((embed) => ({ embeds: [embed], components: [] }));
	const [first = [], ...rest] = chunk(buttons, 25 - menus.length * 5).map(buttonRows);
	messages[messages.length - 1].components = [...menus, ...first];
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
