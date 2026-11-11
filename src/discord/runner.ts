import { MessageFlags, type RepliableInteraction } from 'discord.js';
import { describeError, type Effect, type Outcome } from '../core';

type Handler<T extends Effect> = (effect: T, interaction: RepliableInteraction) => Promise<unknown>;
type Handlers = { [K in Effect['type']]: Handler<Extract<Effect, { type: K }>> };

const handlers: Handlers = {
	'private-reply': (effect, interaction) => replyPrivately(interaction, effect.content)
};

export async function runOutcome(interaction: RepliableInteraction, outcome: Outcome<unknown>): Promise<void> {
	if (!outcome.ok) {
		await replyPrivately(interaction, describeError(outcome.error));
		return;
	}
	for (const effect of outcome.effects) await runEffect(interaction, effect);
}

function runEffect<T extends Effect>(interaction: RepliableInteraction, effect: T) {
	const handler = handlers[effect.type] as Handler<T>;
	return handler(effect, interaction);
}

function replyPrivately(interaction: RepliableInteraction, content: string) {
	const options = { content, flags: MessageFlags.Ephemeral } as const;
	return interaction.replied || interaction.deferred ? interaction.followUp(options) : interaction.reply(options);
}
