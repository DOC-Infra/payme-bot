import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ChannelType, MessageFlags, InteractionContextType } from 'discord.js';
import { checkEmployeeLink, linkEmployee } from '../core';
import { memberToActor } from '../discord/actor';
import { runAsActor } from '../discord/runner';
import { checkEmployeeChannel } from '../discord/botPermissions';

@ApplyOptions<Command.Options>({
	description: 'Link a member to their channel and Minecraft Name, or change them (Leadership only)'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setContexts(InteractionContextType.Guild)
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
		await runAsActor(interaction, { code: 'not-permitted' }, async (actor, payMe) => {
			const refused =
				checkEmployeeLink(payMe, actor, linked.userId, channelId) ?? (await checkEmployeeChannel(interaction.guildId!, channelId));
			return refused ?? linkEmployee(payMe, actor, linked, minecraftName, channelId);
		});
	}
}
