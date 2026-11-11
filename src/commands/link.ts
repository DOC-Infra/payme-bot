import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ChannelType, MessageFlags } from 'discord.js';
import { linkEmployee } from '../core';
import { memberToActor } from '../discord/actor';
import { runAsActor } from '../discord/runner';

@ApplyOptions<Command.Options>({
	description: 'Link a member to their channel and Minecraft Name, or change them (Leadership only)'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addUserOption((option) => option.setName('user').setDescription('The member to link').setRequired(true))
				.addStringOption((option) => option.setName('minecraft').setDescription('Their Minecraft Name').setRequired(true).setMaxLength(16))
				.addChannelOption((option) =>
					option.setName('channel').setDescription('Their Employee Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const { options } = interaction;
		const linked = memberToActor(options.getUser('user', true).id, options.getMember('user'));
		const minecraftName = options.getString('minecraft', true);
		const channelId = options.getChannel('channel', true).id;
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) =>
			linkEmployee(this.container.payMe, actor, linked, minecraftName, channelId)
		);
	}
}
