import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { fail, requestForm } from '../core';
import { toActor } from '../discord/actor';
import { buildRequestModal } from '../discord/requestModal';
import { runOutcome } from '../discord/runner';

@ApplyOptions<Command.Options>({
	description: 'Submit a Payment Request for a Task you completed'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => builder.setName(this.name).setDescription(this.description));
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const actor = toActor(interaction);
		const form = actor ? requestForm(this.container.payMe, actor) : fail({ code: 'not-hired' });
		if (!form.ok) return runOutcome(interaction, form);
		return interaction.showModal(buildRequestModal(form.value));
	}
}
