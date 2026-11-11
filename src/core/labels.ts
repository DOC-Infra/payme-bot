import type { Tone } from './effects';

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

const requestTones: Record<RequestState, Tone> = {
	pending: 'info',
	approved: 'success',
	rejected: 'warning',
	denied: 'danger',
	withdrawn: 'neutral',
	paid: 'success'
};

const payoutTones: Record<PayoutState, Tone> = { open: 'info', paid: 'success', discarded: 'neutral' };

export function stateTone(state: RequestState): Tone {
	return requestTones[state];
}

export function payoutTone(state: PayoutState): Tone {
	return payoutTones[state];
}

function capitalise(text: string): string {
	return text[0].toUpperCase() + text.slice(1);
}
