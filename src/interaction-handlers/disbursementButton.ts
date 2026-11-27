import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { markDisbursementPaid, requireLeadership, showDisbursement, withdrawDisbursement, type Actor, type PayMe } from '../core';
import { decodeCustomId, type DisbursementButton } from '../discord/customIds';
import { buildDeclineModal } from '../discord/disbursements';
import { acknowledge, runAsActor } from '../discord/runner';

interface Pressed {
	action: DisbursementButton;
	disbursementNumber: number;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, pressed: Pressed) {
		if (pressed.action === 'show') await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		else if (pressed.action !== 'decline') await acknowledge(interaction);
		await runAsActor(interaction, { code: 'not-permitted' }, (actor, payMe) => this.press(interaction, payMe, actor, pressed));
	}

	public override parse(interaction: ButtonInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'disbursement-button' ? this.some({ action: id.action, disbursementNumber: id.disbursementNumber }) : this.none();
	}

	private async press(interaction: ButtonInteraction, payMe: PayMe, actor: Actor, { action, disbursementNumber }: Pressed) {
		if (action === 'withdraw') return withdrawDisbursement(payMe, actor, disbursementNumber);
		if (action === 'show') return showDisbursement(payMe, actor, disbursementNumber);
		if (action === 'paid') return markDisbursementPaid(payMe, actor, disbursementNumber);

		const refused = requireLeadership(payMe, actor);
		if (refused) return refused;
		await interaction.showModal(buildDeclineModal(disbursementNumber));
		return null;
	}
}
