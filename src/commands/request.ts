import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import { jobsHeldBy } from '../core';
import { fetchActorIn } from '../discord/actor';
import { homeFor } from '../discord/home';
import { startRequest } from '../discord/requestModal';
import { payMeFor } from '../discord/servers';

@ApplyOptions<Command.Options>({
	description: 'Submit a Payment Request for a Task you completed'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
				.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
				.setDescription(this.description)
				.addIntegerOption((option) =>
					option.setName('job').setDescription('The Job the Task belongs to, if you have too many Tasks to list').setAutocomplete(true)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		return startRequest(interaction, null, null, interaction.options.getInteger('job'));
	}

	/** The Jobs the user holds in the server the request would go to, which may not be this one when PayMe is their user app. */
	public override async autocompleteRun(interaction: Command.AutocompleteInteraction) {
		const query = interaction.options.getFocused().toLowerCase();
		const choice = homeFor(interaction.guildId, interaction.user.id, interaction.user.id);
		const actor = choice.kind === 'home' ? await fetchActorIn(choice.guildId, interaction.user.id) : null;
		const jobs = actor && choice.kind === 'home' ? jobsHeldBy(payMeFor(choice.guildId), actor) : [];
		const matches = jobs.filter((job) => job.name.toLowerCase().includes(query)).slice(0, 25);
		await interaction.respond(matches.map((job) => ({ name: job.name, value: job.id })));
	}
}
