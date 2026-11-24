import { describe, expect, it } from 'vitest';
import {
	addTask,
	createJob,
	postedRates,
	rateCards,
	ratesChannelId,
	recordPostedRates,
	retireJob,
	retireTask,
	editTask,
	setRatesChannel,
	unsetRatesChannel,
	type Outcome
} from '../../src/core';
import { createTestPayMe, leadership, member } from '../support/payme';

function created<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`Expected success, got ${outcome.error.code}`);
	return outcome.value;
}

describe('The Rates Channel', () => {
	it('lets only Leadership set or unset it, and remembers where the Rates were posted', () => {
		const payMe = createTestPayMe();
		const manager = member('user-casey', 'role-courier-manager');

		expect(setRatesChannel(payMe, manager, 'channel-rates')).toEqual({ ok: false, error: { code: 'not-permitted' } });
		expect(ratesChannelId(payMe)).toBeNull();

		expect(setRatesChannel(payMe, leadership(), 'channel-rates')).toMatchObject({ ok: true });
		expect(setRatesChannel(payMe, leadership(), 'channel-new')).toMatchObject({ ok: true });
		expect(ratesChannelId(payMe)).toBe('channel-new');
		recordPostedRates(payMe, { channelId: 'channel-new', messageIds: ['m1', 'm2'] });
		expect(postedRates(payMe)).toEqual({ channelId: 'channel-new', messageIds: ['m1', 'm2'] });

		expect(unsetRatesChannel(payMe, manager)).toEqual({ ok: false, error: { code: 'not-permitted' } });
		expect(unsetRatesChannel(payMe, leadership())).toMatchObject({
			effects: [{ card: { description: '<#channel-new> is no longer the Rates Channel.' } }]
		});
		expect(ratesChannelId(payMe)).toBeNull();
	});

	it("lists each active Job's active Tasks with their Rates, once under each Job a shared Task belongs to", () => {
		const payMe = createTestPayMe();
		const courier = created(
			createJob(payMe, leadership(), { name: 'Courier', employeeRoleId: 'role-courier', reviewChannelId: 'review-courier' })
		);
		const miner = created(createJob(payMe, leadership(), { name: 'Miner', employeeRoleId: 'role-miner', reviewChannelId: 'review-miner' }));
		const old = created(createJob(payMe, leadership(), { name: 'Old', employeeRoleId: 'role-old', reviewChannelId: 'review-old' }));
		created(createJob(payMe, leadership(), { name: 'Farmer', employeeRoleId: 'role-farmer', reviewChannelId: 'review-farmer' }));
		retireJob(payMe, leadership(), old.id);
		created(addTask(payMe, leadership(), { name: 'Deliver Parcel', rate: '1500', jobIds: [courier.id] }));
		const cart = created(addTask(payMe, leadership(), { name: 'Load Cart', rate: '12.5', jobIds: [courier.id, miner.id] }));
		created(editTask(payMe, leadership(), cart.id, { evidenceRequired: false }));
		retireTask(payMe, leadership(), created(addTask(payMe, leadership(), { name: 'Old Route', rate: '5', jobIds: [courier.id] })).id);

		expect(rateCards(payMe)).toEqual([
			{ tone: 'info', title: 'Courier Rates', description: '**Deliver Parcel**: $1,500\n**Load Cart**: $12.5' },
			{ tone: 'info', title: 'Farmer Rates', description: 'No Tasks yet.' },
			{ tone: 'info', title: 'Miner Rates', description: '**Load Cart**: $12.5' }
		]);
	});

	it('says so when there are no Jobs', () => {
		expect(rateCards(createTestPayMe())).toEqual([{ tone: 'neutral', description: 'There are no Jobs yet.' }]);
	});
});
