import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ChannelType, MessageFlags, InteractionContextType } from 'discord.js';
import { setRatesChannel, unsetRatesChannel } from '../core';
import { runAsActor } from '../discord/runner';
import { payMeOf } from '../discord/servers';

@ApplyOptions<Command.Options>({
	name: 'rates-channel',
	description: "Choose the channel where PayMe keeps every Job's Rates posted (Leadership only)"
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setContexts(InteractionContextType.Guild)
				.setDescription(this.description)
				.addSubcommand((sub) =>
					sub
						.setName('set')
						.setDescription('Make a channel the Rates Channel, moving the Rates there from any earlier one')
						.addChannelOption((option) =>
							option.setName('channel').setDescription('The Rates Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)
						)
				)
				.addSubcommand((sub) => sub.setName('unset').setDescription('Stop posting the Rates, deleting the messages PayMe posted'))
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const payMe = payMeOf(interaction);
		const { options } = interaction;
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) =>
			options.getSubcommand() === 'set'
				? setRatesChannel(payMe, actor, options.getChannel('channel', true).id)
				: unsetRatesChannel(payMe, actor)
		);
	}
}
