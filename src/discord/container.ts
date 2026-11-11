import type { Config } from '../env';
import type { PayMe } from '../core';

declare module '@sapphire/pieces' {
	interface Container {
		config: Config;
		payMe: PayMe;
	}
}
