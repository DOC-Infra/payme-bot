import type { Storage } from '../storage/storage';

export interface PayMeConfig {
	leadershipRoleId: string;
}

export interface PayMe {
	storage: Storage;
	config: PayMeConfig;
}

export function createPayMe(storage: Storage, config: PayMeConfig): PayMe {
	return { storage, config };
}
