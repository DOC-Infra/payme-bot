import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { fail, myRequests } from '../core';
import { toActor } from '../discord/actor';
import { runOutcome } from '../discord/runner';

@ApplyOptions<Command.Options>({
	description: 'Show your open Payment Requests and an estimate of what you are owed'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => builder.setName(this.name).setDescription(this.description));
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const actor = toActor(interaction);
		return runOutcome(interaction, actor ? myRequests(this.container.payMe, actor) : fail({ code: 'not-hired' }));
	}
}
