/** A month as YYYY-MM, from 2000-01 to 2999-12, or null. */
export function parseMonth(text: string): string | null {
	const match = /^(2\d{3})-(0[1-9]|1[0-2])$/.exec(text.trim());
	return match ? match[0] : null;
}

/** The UTC calendar month a time falls in, as YYYY-MM. */
export function monthOf(time: Date | string): string {
	return (typeof time === 'string' ? time : time.toISOString()).slice(0, 7);
}

export function monthName(month: string): string {
	const [year, monthNumber] = month.split('-').map(Number);
	return new Date(Date.UTC(year, monthNumber - 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Next month and the twelve before it, newest first, for picking a month. */
export function recentMonths(now: Date): string[] {
	return Array.from({ length: 13 }, (_, index) => monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1 - index))));
}
