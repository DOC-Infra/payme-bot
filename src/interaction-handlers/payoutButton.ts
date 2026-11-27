import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { discardPayout, markPayoutPaid, type Actor, type PayMe } from '../core';
import { decodeCustomId, type PayoutButton } from '../discord/customIds';
import { acknowledge, runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, button: InteractionHandler.ParseResult<this>) {
		await acknowledge(interaction);
		await runAsActor(interaction, { code: 'not-permitted' }, (actor, payMe) => this.press(payMe, actor, button));
	}

	public override parse(interaction: ButtonInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'payout-button' ? this.some(id) : this.none();
	}

	private press(payMe: PayMe, actor: Actor, button: PayoutButton) {
		if (button.action === 'paid') return markPayoutPaid(payMe, actor, button.payoutNumber, button.revision);
		return discardPayout(payMe, actor, button.payoutNumber, button.revision);
	}
}
