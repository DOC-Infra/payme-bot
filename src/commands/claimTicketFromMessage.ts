import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandType, ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import { ticketNumberIn } from '../core';
import { startTicketClaim } from '../discord/requestModal';

@ApplyOptions<Command.Options>({
	name: 'Claim ticket',
	description: 'Claim payment for helping with a DOC ticket, picking the Job and entering its 5-digit number'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerContextMenuCommand((builder) =>
			builder
				.setName(this.name)
				.setType(ApplicationCommandType.Message)
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
				.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
		);
	}

	/** Fills in the ticket number when the message mentions one, such as a ticket's own message. */
	public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction) {
		if (!interaction.isMessageContextMenuCommand()) return;
		await startTicketClaim(interaction, ticketNumberIn(interaction.targetMessage.content));
	}
}
