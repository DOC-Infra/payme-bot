import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import type { SlashCommandBooleanOption, SlashCommandIntegerOption } from 'discord.js';
import {
	addTask,
	addTaskToJob,
	allJobs,
	allTasks,
	changeRate,
	listTasks,
	removeTaskFromJob,
	restoreTask,
	retireTask,
	setEvidenceRequired,
	setNotesRequired,
	type Actor,
	type Outcome
} from '../core';
import { runAsActor, runOutcome } from '../discord/runner';

const extraJobOptions = ['job-2', 'job-3', 'job-4', 'job-5'];

const taskOption = (option: SlashCommandIntegerOption) => option.setName('task').setDescription('The Task').setRequired(true).setAutocomplete(true);
const evidenceOption = (option: SlashCommandBooleanOption) =>
	option.setName('evidence-required').setDescription('Whether requests need a link or a file (default true)');
const notesOption = (option: SlashCommandBooleanOption) =>
	option.setName('notes-required').setDescription('Whether requests need notes (default true)');
const jobOption = (name: string, required: boolean) => (option: SlashCommandIntegerOption) =>
	option.setName(name).setDescription('A Job').setRequired(required).setAutocomplete(true);

interface Choice {
	name: string;
	value: number;
	retired: boolean;
}

@ApplyOptions<Command.Options>({
	description: 'Manage the Rate Schedule (Leadership only, except list)'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addSubcommand((sub) => {
					sub.setName('add')
						.setDescription('Add a Task')
						.addStringOption((option) => option.setName('name').setDescription('The Task name').setRequired(true).setMaxLength(100))
						.addStringOption((option) => option.setName('rate').setDescription('The Rate, like 1500 or 12.5').setRequired(true))
						.addIntegerOption(jobOption('job', true));
					for (const name of extraJobOptions) sub.addIntegerOption(jobOption(name, false));
					return sub.addBooleanOption(evidenceOption).addBooleanOption(notesOption);
				})
				.addSubcommand((sub) =>
					sub
						.setName('rate')
						.setDescription("Change a Task's Rate")
						.addIntegerOption(taskOption)
						.addStringOption((option) => option.setName('rate').setDescription('The new Rate, like 1500 or 12.5').setRequired(true))
				)
				.addSubcommand((sub) =>
					sub
						.setName('evidence')
						.setDescription('Choose whether a Task needs a link or a file as Evidence')
						.addIntegerOption(taskOption)
						.addBooleanOption((option) => evidenceOption(option).setRequired(true))
				)
				.addSubcommand((sub) =>
					sub
						.setName('notes')
						.setDescription('Choose whether a Task needs notes')
						.addIntegerOption(taskOption)
						.addBooleanOption((option) => notesOption(option).setRequired(true))
				)
				.addSubcommandGroup((group) =>
					group
						.setName('jobs')
						.setDescription('Change the Jobs a Task belongs to')
						.addSubcommand((sub) =>
							sub
								.setName('add')
								.setDescription('Add a Task to a Job')
								.addIntegerOption(taskOption)
								.addIntegerOption(jobOption('job', true))
						)
						.addSubcommand((sub) =>
							sub
								.setName('remove')
								.setDescription('Remove a Task from a Job')
								.addIntegerOption(taskOption)
								.addIntegerOption(jobOption('job', true))
						)
				)
				.addSubcommand((sub) => sub.setName('retire').setDescription('Retire a Task').addIntegerOption(taskOption))
				.addSubcommand((sub) => sub.setName('restore').setDescription('Bring back a Retired Task').addIntegerOption(taskOption))
				.addSubcommand((sub) => sub.setName('list').setDescription('Show the Rate Schedule'))
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (interaction.options.getSubcommand() === 'list') return runOutcome(interaction, listTasks(this.container.payMe));

		return runAsActor(interaction, { code: 'not-permitted' }, (actor) => this.run(interaction, actor));
	}

	public override async autocompleteRun(interaction: Command.AutocompleteInteraction) {
		const focused = interaction.options.getFocused(true);
		const query = focused.value.toLowerCase();
		const { payMe } = this.container;
		const choices: Choice[] =
			focused.name === 'task'
				? allTasks(payMe).map((task) => ({ name: task.name, value: task.id, retired: task.retired }))
				: allJobs(payMe).map((job) => ({ name: job.name, value: job.id, retired: job.retired }));

		const matches = choices.filter((choice) => choice.name.toLowerCase().includes(query)).slice(0, 25);
		await interaction.respond(
			matches.map((choice) => ({ name: choice.retired ? `${choice.name} (retired)` : choice.name, value: choice.value }))
		);
	}

	private run(interaction: Command.ChatInputCommandInteraction, actor: Actor): Outcome<unknown> {
		const { payMe } = this.container;
		const { options } = interaction;
		const subcommand = options.getSubcommand();

		if (options.getSubcommandGroup() === 'jobs') {
			const taskId = options.getInteger('task', true);
			const jobId = options.getInteger('job', true);
			return subcommand === 'add' ? addTaskToJob(payMe, actor, taskId, jobId) : removeTaskFromJob(payMe, actor, taskId, jobId);
		}

		switch (subcommand) {
			case 'add': {
				const extraJobIds = extraJobOptions.map((name) => options.getInteger(name)).filter((id): id is number => id !== null);
				return addTask(payMe, actor, {
					name: options.getString('name', true),
					rate: options.getString('rate', true),
					evidenceRequired: options.getBoolean('evidence-required') ?? true,
					notesRequired: options.getBoolean('notes-required') ?? true,
					jobIds: [...new Set([options.getInteger('job', true), ...extraJobIds])]
				});
			}
			case 'evidence':
				return setEvidenceRequired(payMe, actor, options.getInteger('task', true), options.getBoolean('evidence-required', true));
			case 'notes':
				return setNotesRequired(payMe, actor, options.getInteger('task', true), options.getBoolean('notes-required', true));
			case 'rate':
				return changeRate(payMe, actor, options.getInteger('task', true), options.getString('rate', true));
			case 'restore':
				return restoreTask(payMe, actor, options.getInteger('task', true));
			default:
				return retireTask(payMe, actor, options.getInteger('task', true));
		}
	}
}
