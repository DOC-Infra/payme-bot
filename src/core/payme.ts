import { requestStore, type RequestStore } from '../storage/requests';
import type { Storage } from '../storage/storage';

export interface PayMe {
	storage: Storage;
	/** Where Payment Requests are loaded from and saved to. */
	requests: RequestStore;
}

export function createPayMe(storage: Storage): PayMe {
	return { storage, requests: requestStore(storage) };
}
