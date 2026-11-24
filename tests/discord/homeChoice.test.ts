import { describe, expect, it } from 'vitest';
import { chooseHome } from '../../src/discord/homeChoice';

describe('Choosing the home server for a request made outside a PayMe server', () => {
	it('uses the only server that fits, without asking', () => {
		expect(chooseHome(['server-a'], null)).toEqual({ kind: 'home', guildId: 'server-a' });
	});

	it('asks when several fit and the user has not picked one of them', () => {
		expect(chooseHome(['server-a', 'server-b'], null)).toEqual({ kind: 'ask', guildIds: ['server-a', 'server-b'] });
		expect(chooseHome(['server-a', 'server-b'], 'server-gone')).toEqual({ kind: 'ask', guildIds: ['server-a', 'server-b'] });
	});

	it("uses the user's pick while it still fits", () => {
		expect(chooseHome(['server-a', 'server-b'], 'server-b')).toEqual({ kind: 'home', guildId: 'server-b' });
	});

	it('uses the only server that fits even when the pick no longer does', () => {
		expect(chooseHome(['server-a'], 'server-b')).toEqual({ kind: 'home', guildId: 'server-a' });
	});

	it('has nowhere to go when no server fits', () => {
		expect(chooseHome([], 'server-a')).toEqual({ kind: 'none' });
	});
});
