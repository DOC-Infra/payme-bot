export type PayMeError = { code: 'not-permitted' } | { code: 'job-not-found' } | { code: 'job-name-taken'; name: string };

export function describeError(error: PayMeError): string {
	switch (error.code) {
		case 'not-permitted':
			return 'Only Leadership can do that.';
		case 'job-not-found':
			return 'That Job does not exist.';
		case 'job-name-taken':
			return `A Job named ${error.name} already exists.`;
	}
}
