import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { fail, isLeadership, viewPayouts, type Actor } from '../core';
import { memberToActor, toActor } from '../discord/actor';
import { runOutcome } from '../discord/runner';

@ApplyOptions<Command.Options>({
	description: 'See who is owed; Leadership can generate, mark paid or discard Payouts'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => builder.setName(this.name).setDescription(this.description));
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const actor = toActor(interaction);
		if (!actor) return runOutcome(interaction, fail({ code: 'not-permitted' }));

		const { payMe } = this.container;
		const members = isLeadership(payMe, actor) ? [] : await this.members();
		return runOutcome(interaction, viewPayouts(payMe, actor, members));
	}

	private async members(): Promise<Actor[]> {
		const guild = await this.container.client.guilds.fetch(this.container.config.guildId);
		const members = await guild.members.fetch();
		return members.map((member) => memberToActor(member.id, member));
	}
}
