import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandType, ChannelType, InteractionContextType } from 'discord.js';
import { checkEmployeeLink, fail, getEmployee } from '../core';
import { buildLinkModal } from '../discord/hireModal';
import { runAsActor } from '../discord/runner';

@ApplyOptions<Command.Options>({
	name: 'Link Employee',
	description: "Link this message's author to the channel it was sent in, asking for their Minecraft Name (Leadership only)"
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerContextMenuCommand((builder) =>
			builder.setName(this.name).setContexts(InteractionContextType.Guild).setType(ApplicationCommandType.Message)
		);
	}

	/** The author is the Employee. Their channel is the one the message is in, or the one holding the thread it is in. */
	public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction) {
		if (!interaction.isMessageContextMenuCommand()) return;
		const { author, channel } = interaction.targetMessage;
		const channelId = channel?.isThread() ? channel.parentId : channel?.id;
		const parent = channelId ? await interaction.guild?.channels.fetch(channelId).catch(() => null) : null;

		await runAsActor(interaction, { code: 'not-permitted' }, async (actor, payMe) => {
			if (author.bot || interaction.targetMessage.webhookId) return fail({ code: 'link-needs-a-member' });
			if (!channelId || parent?.type !== ChannelType.GuildText) return fail({ code: 'link-needs-a-member' });
			const refused = checkEmployeeLink(payMe, actor, author.id, channelId);
			if (refused) return refused;
			await interaction.showModal(buildLinkModal(author.id, channelId, getEmployee(payMe, author.id)?.minecraftName ?? null));
			return null;
		});
	}
}
