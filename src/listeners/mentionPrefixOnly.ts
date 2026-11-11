import type { Events } from '@sapphire/framework';
import { Listener } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { notice } from '../core';
import { toEmbeds } from '../discord/embeds';

export class UserEvent extends Listener<typeof Events.MentionPrefixOnly> {
	public override run(message: Message) {
		// Do nothing if we cannot send messages in the channel (eg. group DMs)
		if (!message.channel.isSendable()) return;

		const prefix = this.container.client.options.defaultPrefix;
		const card = prefix
			? notice(`My prefix in this guild is: \`${prefix}\``, 'info')
			: notice('Cannot find any Prefix for Message Commands.', 'warning');
		return message.channel.send({ embeds: toEmbeds(card) });
	}
}
