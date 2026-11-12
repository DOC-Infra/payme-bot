import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { discardPayout, generatePayout, markPayoutPaid, showPayout, type Actor } from '../core';
import { decodeCustomId, type PayoutButton } from '../discord/customIds';
import { acknowledge, runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, button: InteractionHandler.ParseResult<this>) {
		if (button.action === 'paid' || button.action === 'discard') await acknowledge(interaction);
		else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await runAsActor(interaction, { code: 'not-permitted' }, (actor) => this.press(actor, button));
	}

	public override parse(interaction: ButtonInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'payout-button' ? this.some(id) : this.none();
	}

	private press(actor: Actor, button: PayoutButton) {
		const { payMe } = this.container;
		if (button.action === 'generate') return generatePayout(payMe, actor, button.employeeUserId);
		if (button.action === 'show') return showPayout(payMe, actor, button.payoutNumber);
		if (button.action === 'paid') return markPayoutPaid(payMe, actor, button.payoutNumber);
		return discardPayout(payMe, actor, button.payoutNumber);
	}
}
