export type PayMeError = { code: 'not-permitted' };

export function describeError(error: PayMeError): string {
	switch (error.code) {
		case 'not-permitted':
			return 'Only Leadership can do that.';
	}
}
