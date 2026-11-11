export type PayMeError =
	| { code: 'not-permitted' }
	| { code: 'job-not-found' }
	| { code: 'job-name-taken'; name: string }
	| { code: 'job-retired'; name: string }
	| { code: 'invalid-rate'; rate: string }
	| { code: 'task-not-found' }
	| { code: 'task-name-taken'; name: string }
	| { code: 'task-needs-a-job' }
	| { code: 'too-many-tasks'; job: string };

export function describeError(error: PayMeError): string {
	switch (error.code) {
		case 'not-permitted':
			return 'Only Leadership can do that.';
		case 'job-not-found':
			return 'That Job does not exist.';
		case 'job-name-taken':
			return `A Job named ${error.name} already exists.`;
		case 'job-retired':
			return `The ${error.name} Job is retired.`;
		case 'task-not-found':
			return 'That Task does not exist.';
		case 'task-name-taken':
			return `A Task named ${error.name} already exists.`;
		case 'task-needs-a-job':
			return 'A Task must belong to at least one Job.';
		case 'too-many-tasks':
			return `The ${error.job} Job already has 25 active Tasks, the most a request form can list. Retire one first.`;
		case 'invalid-rate':
			return `${error.rate} is not a valid Rate. Use a plain number above zero with at most two decimal places and no currency symbol, like 1500 or 12.5.`;
	}
}
