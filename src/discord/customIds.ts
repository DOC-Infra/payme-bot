/** A custom ID that carries the member a form or menu is about, such as the Employee a request is for. */
export function withUserId(baseId: string, userId: string | null): string {
	return userId ? `${baseId}:${userId}` : baseId;
}

/** The user ID from a custom ID made by withUserId: null when it carries none, undefined when it isn't `baseId`. */
export function userIdFrom(baseId: string, customId: string): string | null | undefined {
	if (customId === baseId) return null;
	return customId.startsWith(`${baseId}:`) ? customId.slice(baseId.length + 1) : undefined;
}
