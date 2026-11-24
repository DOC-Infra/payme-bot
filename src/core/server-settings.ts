import { saveSetting, selectSetting } from '../storage/settings';
import type { Actor } from './actor';
import { notice } from './effects';
import { succeed, type Outcome } from './outcome';
import type { PayMe } from './payme';
import { requireLeadership } from './permissions';

const employeeCategoryKey = 'employee-category';

/** The category Leadership picked for new Employee Channels, or null to use PayMe's own "Employees" category. */
export function employeeCategoryId(payMe: PayMe): string | null {
	return selectSetting(payMe.storage, employeeCategoryKey);
}

export function setEmployeeCategory(payMe: PayMe, actor: Actor, categoryId: string): Outcome {
	const refused = requireLeadership(payMe, actor);
	if (refused) return refused;
	saveSetting(payMe.storage, employeeCategoryKey, categoryId);
	return succeed([{ type: 'private-reply', card: notice(`New Employee Channels will be created in <#${categoryId}>.`) }]);
}
