import type { Effect } from './effects';
import type { PayMeError } from './errors';

export type Outcome<T = undefined> = Success<T> | Failure;

export interface Success<T> {
	ok: true;
	value: T;
	effects: Effect[];
}

export interface Failure {
	ok: false;
	error: PayMeError;
}

export function succeed(effects?: Effect[]): Success<undefined>;
export function succeed<T>(effects: Effect[], value: T): Success<T>;
export function succeed<T>(effects: Effect[] = [], value?: T): Success<T | undefined> {
	return { ok: true, value, effects };
}

export function fail(error: PayMeError): Failure {
	return { ok: false, error };
}
