import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { discardPayout, fail, generatePayout, markPayoutPaid, viewPayout, type Actor } from '../core';
import { toActor } from '../discord/actor';
import { parsePayoutButton, type PayoutButton } from '../discord/payouts';
import { runOutcome } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, button: InteractionHandler.ParseResult<this>) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const actor = toActor(interaction);
		await runOutcome(interaction, actor ? this.press(actor, button) : fail({ code: 'not-permitted' }));
	}

	public override parse(interaction: ButtonInteraction) {
		const parsed = parsePayoutButton(interaction.customId);
		return parsed ? this.some(parsed) : this.none();
	}

	private press(actor: Actor, button: PayoutButton) {
		const { payMe } = this.container;
		if (button.action === 'generate') return generatePayout(payMe, actor, button.employeeUserId);
		if (button.action === 'show') return viewPayout(payMe, actor, button.payoutNumber);
		if (button.action === 'paid') return markPayoutPaid(payMe, actor, button.payoutNumber);
		return discardPayout(payMe, actor, button.payoutNumber);
	}
}
