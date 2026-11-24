/** Where a request made outside a PayMe server should be filed, or that the user must pick, or that there is nowhere. */
export type HomeChoice = { kind: 'home'; guildId: string } | { kind: 'ask'; guildIds: string[] } | { kind: 'none' };

/**
 * The home server among `candidates`: the one the user picked before if it is still a candidate, else the only candidate. With
 * several and no usable pick, the user must choose.
 */
export function chooseHome(candidates: readonly string[], saved: string | null): HomeChoice {
	if (saved && candidates.includes(saved)) return { kind: 'home', guildId: saved };
	if (candidates.length === 1) return { kind: 'home', guildId: candidates[0] };
	if (candidates.length === 0) return { kind: 'none' };
	return { kind: 'ask', guildIds: [...candidates] };
}
