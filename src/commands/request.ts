import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { jobsHeldBy } from '../core';
import { toActor } from '../discord/actor';
import { openRequestForm } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<Command.Options>({
	description: 'Submit a Payment Request for a Task you completed'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addIntegerOption((option) =>
					option.setName('job').setDescription('The Job the Task belongs to, if you have too many Tasks to list').setAutocomplete(true)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		return runAsActor(interaction, { code: 'not-hired' }, openRequestForm(interaction, interaction.options.getInteger('job')));
	}

	public override async autocompleteRun(interaction: Command.AutocompleteInteraction) {
		const actor = toActor(interaction);
		const query = interaction.options.getFocused().toLowerCase();
		const jobs = actor ? jobsHeldBy(this.container.payMe, actor) : [];
		const matches = jobs.filter((job) => job.name.toLowerCase().includes(query)).slice(0, 25);
		await interaction.respond(matches.map((job) => ({ name: job.name, value: job.id })));
	}
}
