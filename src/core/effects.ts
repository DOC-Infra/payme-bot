export type Effect = PrivateReply;

export interface PrivateReply {
	type: 'private-reply';
	content: string;
}
