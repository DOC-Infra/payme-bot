import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandType } from 'discord.js';
import { fetchActor } from '../discord/actor';
import { openRequestForm } from '../discord/requestModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<Command.Options>({
	name: 'Request payment for',
	description: 'Submit a Payment Request on behalf of an Employee in a Job you manage'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerContextMenuCommand((builder) => builder.setName(this.name).setType(ApplicationCommandType.User));
	}

	public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction) {
		if (!interaction.isUserContextMenuCommand()) return;
		const employee = await fetchActor(interaction, interaction.targetId);
		await runAsActor(interaction, { code: 'not-their-manager' }, openRequestForm(interaction, null, employee));
	}
}
