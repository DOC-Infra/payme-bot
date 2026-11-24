import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ActionRowBuilder, ApplicationIntegrationType, InteractionContextType, MessageFlags, StringSelectMenuBuilder } from 'discord.js';
import { encodeCustomId } from '../discord/customIds';
import { memberServers, serverName } from '../discord/home';

@ApplyOptions<Command.Options>({
	name: 'home-server',
	description: 'Choose which PayMe server your requests go to when you use PayMe outside one'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
				.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const servers = memberServers(interaction.user.id);
		if (servers.length === 0) {
			await interaction.reply({ content: 'You are not a member of any server PayMe is installed in.', flags: MessageFlags.Ephemeral });
			return;
		}
		const select = new StringSelectMenuBuilder()
			.setCustomId(encodeCustomId({ kind: 'home-set' }))
			.setPlaceholder('Choose a server')
			.addOptions(servers.slice(0, 25).map((guildId) => ({ label: serverName(guildId).slice(0, 100), value: guildId })));
		await interaction.reply({
			content: 'Which server should your requests go to when you use PayMe outside a PayMe server?',
			components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
			flags: MessageFlags.Ephemeral
		});
	}
}
