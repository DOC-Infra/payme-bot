export type PayMeError =
	| { code: 'not-permitted' }
	| { code: 'job-not-found' }
	| { code: 'job-name-taken'; name: string }
	| { code: 'already-employee' }
	| { code: 'invalid-minecraft-name'; name: string }
	| { code: 'employee-channel-taken'; channelId: string };

export function describeError(error: PayMeError): string {
	switch (error.code) {
		case 'not-permitted':
			return 'Only Leadership can do that.';
		case 'job-not-found':
			return 'That Job does not exist.';
		case 'job-name-taken':
			return `A Job named ${error.name} already exists.`;
		case 'already-employee':
			return 'That member is already an Employee. Use /link to change their Minecraft Name or channel.';
		case 'invalid-minecraft-name':
			return `${error.name} is not a valid Minecraft Name. Use 3 to 16 letters, digits or underscores.`;
		case 'employee-channel-taken':
			return `<#${error.channelId}> is already another Employee's channel.`;
	}
}
