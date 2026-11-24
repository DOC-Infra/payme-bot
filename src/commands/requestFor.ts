import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandType, ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import { startRequest } from '../discord/requestModal';

@ApplyOptions<Command.Options>({
	name: 'Request payment for',
	description: 'Submit a Payment Request on behalf of an Employee in a Job you manage'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerContextMenuCommand((builder) =>
			builder
				.setName(this.name)
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
				.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
				.setType(ApplicationCommandType.User)
		);
	}

	public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction) {
		if (!interaction.isUserContextMenuCommand()) return;
		await startRequest(interaction, interaction.targetId);
	}
}
