import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Guild } from 'discord.js';
import { setUpServer } from '../discord/serverSetup';

/** A server that adds PayMe gets its own database, #payouts dashboard and categories straight away. */
@ApplyOptions<Listener.Options>({ event: Events.GuildCreate })
export class UserEvent extends Listener<typeof Events.GuildCreate> {
	public override async run(guild: Guild) {
		await setUpServer(guild.id);
	}
}
