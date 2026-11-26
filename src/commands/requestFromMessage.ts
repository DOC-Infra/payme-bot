import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandType, ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import { startRequest } from '../discord/requestModal';

@ApplyOptions<Command.Options>({
	name: 'Request payment',
	description: 'Submit a Payment Request for yourself, with the message text as the notes'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerContextMenuCommand((builder) =>
			builder
				.setName(this.name)
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
				.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
				.setType(ApplicationCommandType.Message)
		);
	}

	public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction) {
		if (!interaction.isMessageContextMenuCommand()) return;
		await startRequest(interaction, null, interaction.targetMessage.content);
	}
}
