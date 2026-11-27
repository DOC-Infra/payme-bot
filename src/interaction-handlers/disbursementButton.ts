import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { checkDisbursementChange, markDisbursementPaid, showDisbursement, withdrawDisbursement, type Actor, type PayMe } from '../core';
import { decodeCustomId, type DisbursementButton } from '../discord/customIds';
import { buildDisbursementReasonModal } from '../discord/disbursements';
import { acknowledge, runAsActor } from '../discord/runner';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction, pressed: InteractionHandler.ParseResult<this>) {
		if (pressed.action === 'show') await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		else if (pressed.action !== 'decline' && pressed.action !== 'void') await acknowledge(interaction);
		await runAsActor(interaction, { code: 'not-permitted' }, (actor, payMe) => this.press(interaction, payMe, actor, pressed));
	}

	public override parse(interaction: ButtonInteraction) {
		const id = decodeCustomId(interaction.customId);
		return id?.kind === 'disbursement-button' ? this.some(id) : this.none();
	}

	private async press(
		interaction: ButtonInteraction,
		payMe: PayMe,
		actor: Actor,
		{ action, disbursementNumber }: { action: DisbursementButton; disbursementNumber: number }
	) {
		if (action === 'withdraw') return withdrawDisbursement(payMe, actor, disbursementNumber);
		if (action === 'show') return showDisbursement(payMe, actor, disbursementNumber);
		if (action === 'paid') return markDisbursementPaid(payMe, actor, disbursementNumber);

		const refused = checkDisbursementChange(payMe, actor, disbursementNumber, action);
		if (refused) return refused;
		await interaction.showModal(buildDisbursementReasonModal(action, disbursementNumber));
		return null;
	}
}
