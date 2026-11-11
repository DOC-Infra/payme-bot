import type { ContextMenuCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { notice } from '../../../core';
import { toEmbeds } from '../../../discord/embeds';

export class UserEvent extends Listener<typeof Events.ContextMenuCommandDenied> {
	public override async run({ context, message }: UserError, { interaction }: ContextMenuCommandDeniedPayload) {
		// `context: { silent: true }` should make UserError silent:
		// Use cases for this are for example permissions error when running the `eval` command.
		if (Reflect.get(Object(context), 'silent')) return;

		const options = { embeds: toEmbeds(notice(message, 'danger')), allowedMentions: { users: [interaction.user.id], roles: [] } };
		if (interaction.deferred || interaction.replied) return interaction.editReply(options);
		return interaction.reply({ ...options, flags: MessageFlags.Ephemeral });
	}
}
