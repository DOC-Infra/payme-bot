export function parseRate(text: string): number | null {
	const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
	if (!match) return null;
	const rate = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
	return rate > 0 && Number.isSafeInteger(rate) ? rate : null;
}

/** An amount for people to read, in dollars with commas between thousands, like $1,500 or $12.5. */
export function formatAmount(hundredths: number): string {
	const [whole, cents] = plainAmount(hundredths).split('.');
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return cents ? `$${grouped}.${cents}` : `$${grouped}`;
}

/** An amount without commas: for the in-game pay command, and to fill a form that `parseRate` reads back. */
export function plainAmount(hundredths: number): string {
	const whole = Math.floor(hundredths / 100);
	const cents = String(hundredths % 100)
		.padStart(2, '0')
		.replace(/0+$/, '');
	return cents ? `${whole}.${cents}` : String(whole);
}

/** 100%, in the hundredths of a percent that targets are kept in. */
export const wholePercent = 10000;

/** A percentage above 0 and at most 100, with up to two decimal places, as hundredths of a percent: 12.5 is 1250. */
export function parsePercent(text: string): number | null {
	const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
	if (!match) return null;
	const percent = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
	return percent > 0 && percent <= wholePercent ? percent : null;
}

/** Hundredths of a percent for people to read, like 12.5%. */
export function formatPercent(hundredths: number): string {
	return `${plainAmount(hundredths)}%`;
}
