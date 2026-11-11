import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { jobsHeldBy, requestForm } from '../core';
import { toActor } from '../discord/actor';
import { buildRequestModal } from '../discord/requestModal';
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
		const jobId = interaction.options.getInteger('job');
		return runAsActor(interaction, { code: 'not-hired' }, async (actor) => {
			const form = requestForm(this.container.payMe, actor, jobId);
			if (!form.ok) return form;
			await interaction.showModal(buildRequestModal(form.value));
			return null;
		});
	}

	public override async autocompleteRun(interaction: Command.AutocompleteInteraction) {
		const actor = toActor(interaction);
		const query = interaction.options.getFocused().toLowerCase();
		const jobs = actor ? jobsHeldBy(this.container.payMe, actor) : [];
		const matches = jobs.filter((job) => job.name.toLowerCase().includes(query)).slice(0, 25);
		await interaction.respond(matches.map((job) => ({ name: job.name, value: job.id })));
	}
}
