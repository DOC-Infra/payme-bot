import { requestStore, type RequestStore } from '../storage/requests';
import type { Storage } from '../storage/storage';

export interface PayMeConfig {
	leadershipRoleId: string;
}

export interface PayMe {
	storage: Storage;
	/** Where Payment Requests are loaded from and saved to. */
	requests: RequestStore;
	config: PayMeConfig;
}

export function createPayMe(storage: Storage, config: PayMeConfig): PayMe {
	return { storage, requests: requestStore(storage), config };
}
