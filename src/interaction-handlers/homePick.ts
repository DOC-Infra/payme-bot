import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { decodeCustomId } from '../discord/customIds';
import { memberServers, rememberHome, serverName } from '../discord/home';
import { continueRequest, openTicketClaim, takeHeldNotes } from '../discord/requestModal';

type Picked = { kind: 'request'; employeeUserId: string | null } | { kind: 'ticket' } | { kind: 'set' };

/** The user picked their home server: remember it, then carry on with the request they were starting, if any. */
@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.SelectMenu
})
export class MenuHandler extends InteractionHandler {
	public async run(interaction: StringSelectMenuInteraction, picked: Picked) {
		const home = interaction.values[0];
		if (!memberServers(interaction.user.id).includes(home)) {
			await interaction.reply({
				content: 'PayMe is no longer in that server, or you are no longer a member of it.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}
		rememberHome(interaction.user.id, home);
		if (picked.kind === 'set') {
			await interaction.reply({
				content: `Requests you make outside a PayMe server now go to **${serverName(home)}** when it fits.`,
				flags: MessageFlags.Ephemeral,
				allowedMentions: { parse: [] }
			});
			return;
		}
		const held = takeHeldNotes(interaction.user.id);
		if (picked.kind === 'ticket') return openTicketClaim(interaction, home, held);
		await continueRequest(interaction, home, picked.employeeUserId, held);
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		const id = decodeCustomId(interaction.customId);
		if (id?.kind === 'home-pick') return this.some<Picked>({ kind: 'request', employeeUserId: id.employeeUserId });
		if (id?.kind === 'ticket-home-pick') return this.some<Picked>({ kind: 'ticket' });
		return id?.kind === 'home-set' ? this.some<Picked>({ kind: 'set' }) : this.none();
	}
}
