import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { InteractionContextType } from 'discord.js';
import { myRequests } from '../core';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<Command.Options>({
	description: 'Show your open Payment Requests and an estimate of what you are owed'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName(this.name).setContexts(InteractionContextType.Guild).setDescription(this.description)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		return runAsActor(interaction, { code: 'not-hired' }, (actor) => myRequests(payMeOf(interaction), actor));
	}
}
