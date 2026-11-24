export interface Actor {
	userId: string;
	roleIds: readonly string[];
	/** Whether they have Discord's Administrator permission on the server, which makes them Leadership. */
	administrator: boolean;
}
