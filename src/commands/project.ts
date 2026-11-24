import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { MessageFlags, type SlashCommandIntegerOption, type SlashCommandStringOption, InteractionContextType } from 'discord.js';
import {
	allJobs,
	allProjects,
	closeProject,
	createProject,
	editShare,
	formatAmount,
	fundProject,
	getEmployee,
	giveShare,
	listProjects,
	removeShare,
	shareLabel,
	showProject,
	type Actor,
	type Outcome,
	type PayMe
} from '../core';
import { fetchActor } from '../discord/actor';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

const projectOption = (option: SlashCommandIntegerOption) =>
	option.setName('project').setDescription('The Project').setRequired(true).setAutocomplete(true);
const shareOption = (option: SlashCommandIntegerOption) =>
	option.setName('share').setDescription('The Share').setRequired(true).setAutocomplete(true);
const amountOption = (description: string) => (option: SlashCommandStringOption) =>
	option.setName('amount').setDescription(description).setRequired(true);

@ApplyOptions<Command.Options>({
	description: 'Projects with a budget that Managers share among Employees'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setContexts(InteractionContextType.Guild)
				.setDescription(this.description)
				.addSubcommand((sub) =>
					sub
						.setName('create')
						.setDescription('Create a Project for a Job with an opening budget (Leadership only)')
						.addStringOption((option) => option.setName('name').setDescription('The Project name').setRequired(true).setMaxLength(100))
						.addIntegerOption((option) => option.setName('job').setDescription('The Job').setRequired(true).setAutocomplete(true))
						.addStringOption((option) => option.setName('budget').setDescription('The budget, like 1500 or 12.5').setRequired(true))
				)
				.addSubcommand((sub) =>
					sub
						.setName('fund')
						.setDescription("Add to a Project's budget (Leadership only)")
						.addIntegerOption(projectOption)
						.addStringOption(amountOption('The amount to add, like 1500 or 12.5'))
				)
				.addSubcommand((sub) =>
					sub
						.setName('share')
						.setDescription("Give an Employee a Share of a Project's budget")
						.addIntegerOption(projectOption)
						.addUserOption((option) => option.setName('employee').setDescription('The Employee').setRequired(true))
						.addStringOption(amountOption('The amount, like 1500 or 12.5'))
						.addStringOption((option) => option.setName('note').setDescription('What the Share is for').setMaxLength(1000))
				)
				.addSubcommand((sub) =>
					sub
						.setName('share-edit')
						.setDescription('Change the amount or note of a Share that has not been paid out')
						.addIntegerOption(shareOption)
						.addStringOption((option) => option.setName('amount').setDescription('The new amount, like 1500 or 12.5'))
						.addStringOption((option) => option.setName('note').setDescription('The new note').setMaxLength(1000))
				)
				.addSubcommand((sub) =>
					sub.setName('share-remove').setDescription('Remove a Share that has not been paid out').addIntegerOption(shareOption)
				)
				.addSubcommand((sub) => sub.setName('close').setDescription('Close a Project (Leadership only)').addIntegerOption(projectOption))
				.addSubcommand((sub) => sub.setName('show').setDescription("Show a Project's budget and Shares").addIntegerOption(projectOption))
				.addSubcommand((sub) => sub.setName('list').setDescription('List Projects'))
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) => this.run(interaction, actor));
	}

	public override async autocompleteRun(interaction: Command.AutocompleteInteraction) {
		const focused = interaction.options.getFocused(true);
		const query = focused.value.toLowerCase();
		const payMe = payMeOf(interaction);
		const choices =
			focused.name === 'share'
				? this.unpaidShareChoices(payMe)
				: focused.name === 'job'
					? allJobs(payMe)
							.filter((job) => !job.retired)
							.map((job) => ({ name: job.name, value: job.id }))
					: allProjects(payMe).map((project) => ({
							name: project.state === 'closed' ? `${project.name} (closed)` : project.name,
							value: project.id
						}));
		await interaction.respond(choices.filter((choice) => choice.name.toLowerCase().includes(query)).slice(0, 25));
	}

	/** Unpaid Shares in Open Projects. One locked in an Open Payout is still listed, and PayMe says why it can't change. */
	private unpaidShareChoices(payMe: PayMe) {
		return allProjects(payMe)
			.filter((project) => project.state === 'open')
			.flatMap((project) =>
				project.shares
					.filter((share) => !share.paid)
					.map((share) => {
						const employee = getEmployee(payMe, share.employeeUserId)?.minecraftName ?? share.employeeUserId;
						return { name: `${shareLabel(share.id)}, ${project.name}, ${employee}: ${formatAmount(share.amount)}`, value: share.id };
					})
			);
	}

	private async run(interaction: Command.ChatInputCommandInteraction, actor: Actor): Promise<Outcome<unknown>> {
		const payMe = payMeOf(interaction);
		const { options } = interaction;

		switch (options.getSubcommand()) {
			case 'create':
				return createProject(payMe, actor, {
					name: options.getString('name', true),
					jobId: options.getInteger('job', true),
					budget: options.getString('budget', true)
				});
			case 'fund':
				return fundProject(payMe, actor, options.getInteger('project', true), options.getString('amount', true));
			case 'share': {
				const employee = await fetchActor(interaction, options.getUser('employee', true).id);
				return giveShare(payMe, actor, options.getInteger('project', true), employee, {
					amount: options.getString('amount', true),
					note: options.getString('note')
				});
			}
			case 'share-edit':
				return editShare(payMe, actor, options.getInteger('share', true), {
					amount: options.getString('amount') ?? undefined,
					note: options.getString('note') ?? undefined
				});
			case 'share-remove':
				return removeShare(payMe, actor, options.getInteger('share', true));
			case 'close':
				return closeProject(payMe, actor, options.getInteger('project', true));
			case 'show':
				return showProject(payMe, actor, options.getInteger('project', true));
			default:
				return listProjects(payMe, actor);
		}
	}
}
