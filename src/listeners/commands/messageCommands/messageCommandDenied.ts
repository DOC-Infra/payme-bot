import type { Events, MessageCommandDeniedPayload } from '@sapphire/framework';
import { Listener, type UserError } from '@sapphire/framework';
import { notice } from '../../../core';
import { toEmbeds } from '../../../discord/embeds';

export class UserEvent extends Listener<typeof Events.MessageCommandDenied> {
	public override async run({ context, message: content }: UserError, { message }: MessageCommandDeniedPayload) {
		// `context: { silent: true }` should make UserError silent:
		// Use cases for this are for example permissions error when running the `eval` command.
		if (Reflect.get(Object(context), 'silent')) return;

		return message.reply({ embeds: toEmbeds(notice(content, 'danger')), allowedMentions: { users: [message.author.id], roles: [] } });
	}
}
