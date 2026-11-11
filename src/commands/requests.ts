import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { myRequests } from '../core';
import { runAsActor } from '../discord/runner';

@ApplyOptions<Command.Options>({
	description: 'Show your open Payment Requests and an estimate of what you are owed'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => builder.setName(this.name).setDescription(this.description));
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		return runAsActor(interaction, { code: 'not-hired' }, (actor) => myRequests(this.container.payMe, actor));
	}
}
