import { container } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	ComponentType,
	LabelBuilder,
	ModalBuilder,
	UserSelectMenuBuilder,
	type ActionRow,
	type Message,
	type MessageActionRowComponent,
	type MessageCreateOptions
} from 'discord.js';
import { dashboardCard } from '../core';
import { decodeCustomId, encodeCustomId, type DashboardButton } from './customIds';
import { toEmbeds } from './embeds';
import { employeesCategoryName, paymentReviewChannel, payoutsChannelName } from './paymentReview';
import { payMeFor } from './servers';

/** How long to wait after a change before editing the dashboard, so a burst of changes makes one edit. */
const refreshDelayMs = 2000;

interface Dashboard {
	message: Message | null;
	shown: string;
	pending: NodeJS.Timeout | null;
}

/** Each server's dashboard, by server ID. */
const dashboards = new Map<string, Dashboard>();

function dashboardOf(guildId: string): Dashboard {
	let state = dashboards.get(guildId);
	if (!state) dashboards.set(guildId, (state = { message: null, shown: '', pending: null }));
	return state;
}

/** Finds PayMe's pinned dashboard in the server's #payouts, creating the channel or the dashboard when missing, and brings it up to date. */
export async function setUpDashboard(guildId: string): Promise<void> {
	const state = dashboardOf(guildId);
	try {
		const channel = await paymentReviewChannel(guildId, payoutsChannelName);
		const pins = await channel.messages.fetchPins();
		state.message = pins.items.map((pin) => pin.message).find(isDashboard) ?? null;
		if (state.message) {
			await refreshDashboard(guildId);
			return;
		}
		const content = dashboardContent(guildId);
		state.message = await channel.send(content);
		state.shown = JSON.stringify(content.embeds);
		await state.message.pin();
	} catch (error) {
		const reason = error instanceof Error && error.message.startsWith("PayMe's role") ? error.message : error;
		container.logger.warn(`Could not set up the Leadership dashboard in #payouts on server ${guildId}:`, reason);
	}
}

/** Edits the server's dashboard shortly, once, however many changes ask for it in the meantime. */
export function scheduleDashboardRefresh(guildId: string): void {
	const state = dashboardOf(guildId);
	if (state.pending) return;
	state.pending = setTimeout(() => {
		state.pending = null;
		void refreshDashboard(guildId).catch((error: unknown) => {
			container.logger.warn(`Could not refresh the Leadership dashboard on server ${guildId}`, error);
			state.message = null;
		});
	}, refreshDelayMs);
}

async function refreshDashboard(guildId: string): Promise<void> {
	const state = dashboardOf(guildId);
	if (!state.message) return setUpDashboard(guildId);
	const content = dashboardContent(guildId);
	const embeds = JSON.stringify(content.embeds);
	if (embeds === state.shown) return;
	await state.message.edit({ ...content, content: null });
	state.shown = embeds;
}

function dashboardContent(guildId: string) {
	return {
		embeds: toEmbeds(dashboardCard(payMeFor(guildId))),
		components: [dashboardButtons(), requestForRow()],
		allowedMentions: { parse: [] }
	} satisfies MessageCreateOptions;
}

function isDashboard(message: Message): boolean {
	if (message.author.id !== container.client.user?.id) return false;
	return message.components
		.filter((row): row is ActionRow<MessageActionRowComponent> => row.type === ComponentType.ActionRow)
		.some((row) => row.components.some((part) => decodeCustomId(part.customId ?? '')?.kind === 'dashboard-button'));
}

const buttons: [DashboardButton, string][] = [
	['payouts', 'Generate Payouts'],
	['projects', 'Projects'],
	['jobs', 'Jobs'],
	['tasks', 'Tasks'],
	['settings', 'Settings']
];

function dashboardButtons(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		buttons.map(([action, label]) =>
			new ButtonBuilder()
				.setCustomId(encodeCustomId({ kind: 'dashboard-button', action }))
				.setLabel(label)
				.setStyle(action === 'payouts' ? ButtonStyle.Primary : ButtonStyle.Secondary)
		)
	);
}

function requestForRow(): ActionRowBuilder<UserSelectMenuBuilder> {
	const select = new UserSelectMenuBuilder()
		.setCustomId(encodeCustomId({ kind: 'dashboard-request-for' }))
		.setPlaceholder('Request payment for an Employee')
		.setMaxValues(1);
	return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select);
}

export const employeeCategoryFieldId = 'employee-category';

/** Server settings an administrator can change: for now, where new Employee Channels are created. */
export function buildSettingsModal(employeeCategoryId: string | null): ModalBuilder {
	const category = new ChannelSelectMenuBuilder()
		.setCustomId(employeeCategoryFieldId)
		.setChannelTypes(ChannelType.GuildCategory)
		.setRequired(true)
		.setMaxValues(1);
	if (employeeCategoryId) category.setDefaultChannels(employeeCategoryId);
	return new ModalBuilder()
		.setCustomId(encodeCustomId({ kind: 'settings-modal' }))
		.setTitle('PayMe settings')
		.addLabelComponents(
			new LabelBuilder()
				.setLabel('Employee Channel category')
				.setDescription(`Where new Employee Channels go. Until you pick one, PayMe uses "${employeesCategoryName}".`)
				.setChannelSelectMenuComponent(category)
		);
}
