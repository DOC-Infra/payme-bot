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
