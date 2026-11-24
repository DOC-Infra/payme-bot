import type { Config } from '../env';

declare module '@sapphire/pieces' {
	interface Container {
		config: Config;
	}
}
