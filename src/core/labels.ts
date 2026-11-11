export type RequestState = 'pending' | 'approved' | 'rejected' | 'denied' | 'withdrawn' | 'paid';

export type PayoutState = 'open' | 'paid' | 'discarded';

export function requestLabel(number: number): string {
	return `R-${number}`;
}

export function payoutLabel(number: number): string {
	return `P-${number}`;
}

export function stateName(state: RequestState): string {
	return capitalise(state);
}

export function payoutStateName(state: PayoutState): string {
	return capitalise(state);
}

function capitalise(text: string): string {
	return text[0].toUpperCase() + text.slice(1);
}
