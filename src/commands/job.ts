import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ChannelType, MessageFlags, type SlashCommandIntegerOption, type SlashCommandRoleOption } from 'discord.js';
import { addManagerRole, allJobs, createJob, editJob, fail, getJob, listJobs, removeManagerRole, retireJob, type Actor, type Outcome } from '../core';
import { toActor } from '../discord/actor';
import { runOutcome } from '../discord/runner';

const jobOption = (option: SlashCommandIntegerOption) => option.setName('job').setDescription('The Job').setRequired(true).setAutocomplete(true);
const managerRoleOption = (option: SlashCommandRoleOption) => option.setName('role').setDescription('The manager role').setRequired(true);

@ApplyOptions<Command.Options>({
	description: 'Manage Jobs (Leadership only)'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addSubcommand((sub) =>
					sub
						.setName('create')
						.setDescription('Create a Job')
						.addStringOption((option) => option.setName('name').setDescription('The Job name').setRequired(true).setMaxLength(100))
						.addRoleOption((option) => option.setName('employee-role').setDescription('The Employee role').setRequired(true))
						.addChannelOption((option) =>
							option
								.setName('review-channel')
								.setDescription('The Review Channel')
								.setRequired(true)
								.addChannelTypes(ChannelType.GuildText)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('edit')
						.setDescription("Change a Job's name, Employee role or Review Channel")
						.addIntegerOption(jobOption)
						.addStringOption((option) => option.setName('name').setDescription('The new name').setMaxLength(100))
						.addRoleOption((option) => option.setName('employee-role').setDescription('The new Employee role'))
						.addChannelOption((option) =>
							option.setName('review-channel').setDescription('The new Review Channel').addChannelTypes(ChannelType.GuildText)
						)
				)
				.addSubcommand((sub) => sub.setName('retire').setDescription('Retire a Job').addIntegerOption(jobOption))
				.addSubcommand((sub) => sub.setName('list').setDescription('List every Job'))
				.addSubcommandGroup((group) =>
					group
						.setName('manager-role')
						.setDescription("Change a Job's manager roles")
						.addSubcommand((sub) =>
							sub.setName('add').setDescription('Add a manager role').addIntegerOption(jobOption).addRoleOption(managerRoleOption)
						)
						.addSubcommand((sub) =>
							sub.setName('remove').setDescription('Remove a manager role').addIntegerOption(jobOption).addRoleOption(managerRoleOption)
						)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const actor = toActor(interaction);
		const outcome = actor ? await this.run(interaction, actor) : fail({ code: 'not-permitted' });
		await runOutcome(interaction, outcome);
	}

	public override async autocompleteRun(interaction: Command.AutocompleteInteraction) {
		const query = interaction.options.getFocused().toLowerCase();
		const jobs = allJobs(this.container.payMe).filter((job) => job.name.toLowerCase().includes(query));
		await interaction.respond(jobs.slice(0, 25).map((job) => ({ name: job.retired ? `${job.name} (retired)` : job.name, value: job.id })));
	}

	private async run(interaction: Command.ChatInputCommandInteraction, actor: Actor): Promise<Outcome<unknown>> {
		const { payMe } = this.container;
		const { options } = interaction;
		const group = options.getSubcommandGroup();
		const subcommand = options.getSubcommand();

		if (group === 'manager-role') {
			const jobId = options.getInteger('job', true);
			const roleId = options.getRole('role', true).id;
			if (subcommand === 'remove') return removeManagerRole(payMe, actor, jobId, roleId);
			return addManagerRole(payMe, actor, jobId, roleId, await this.holderUserIds(jobId));
		}

		switch (subcommand) {
			case 'create':
				return createJob(payMe, actor, {
					name: options.getString('name', true),
					employeeRoleId: options.getRole('employee-role', true).id,
					reviewChannelId: options.getChannel('review-channel', true).id
				});
			case 'edit':
				return editJob(payMe, actor, options.getInteger('job', true), {
					name: options.getString('name') ?? undefined,
					employeeRoleId: options.getRole('employee-role')?.id,
					reviewChannelId: options.getChannel('review-channel')?.id
				});
			case 'retire':
				return retireJob(payMe, actor, options.getInteger('job', true));
			default:
				return listJobs(payMe, actor);
		}
	}

	private async holderUserIds(jobId: number): Promise<string[]> {
		const employeeRoleId = getJob(this.container.payMe, jobId)?.employeeRoleId;
		if (!employeeRoleId) return [];

		const guild = await this.container.client.guilds.fetch(this.container.config.guildId);
		const members = await guild.members.fetch();
		return [...members.filter((member) => member.roles.cache.has(employeeRoleId)).keys()];
	}
}
