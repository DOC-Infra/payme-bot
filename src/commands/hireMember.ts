import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandType } from 'discord.js';
import { checkHire } from '../core';
import { fetchActor } from '../discord/actor';
import { buildHireModal } from '../discord/hireModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<Command.Options>({
	name: 'Hire as Employee',
	description: 'Hire a member as an Employee, asking for their Minecraft Name (Leadership only)'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerContextMenuCommand((builder) => builder.setName(this.name).setType(ApplicationCommandType.User));
	}

	public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction) {
		if (!interaction.isUserContextMenuCommand()) return;
		const hiree = await fetchActor(interaction, interaction.targetId);
		await runAsActor(interaction, { code: 'not-permitted' }, async (actor) => {
			const refused = checkHire(this.container.payMe, actor, hiree);
			if (refused) return refused;
			await interaction.showModal(buildHireModal(hiree.userId));
			return null;
		});
	}
}
