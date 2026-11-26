import { describe, expect, it } from 'vitest';
import type { Job, Share, Task, TaskForm } from '../../src/core';
import { buildSettingsModal } from '../../src/discord/dashboard';
import { buildAmendModal } from '../../src/discord/entry';
import { buildHireModal, buildLinkModal } from '../../src/discord/hireModal';
import { buildEditTaskModal, buildJobModal, buildManagerRolesModal, buildNewTaskModal, buildTaskJobsModal } from '../../src/discord/manage';
import { buildCreateProjectModal, buildEditShareModal, buildFundModal, buildGiveShareModal } from '../../src/discord/projects';
import { buildClaimTicketModal, buildRequestModal } from '../../src/discord/requestModal';
import { buildReasonModal } from '../../src/discord/review';

const id = '123456789012345678';
/** A name as long as PayMe allows, to push titles and labels to their limits. */
const longName = 'N'.repeat(100);
const job = (jobId: number): Job => ({
	id: jobId,
	name: `${longName.slice(0, 95)}${jobId}`,
	employeeRoleId: id,
	reviewChannelId: id,
	managerRoleIds: [id],
	retired: false
});
const jobs = Array.from({ length: 25 }, (_, index) => job(index + 1));
const task: Task = { id: 1, name: longName, rate: 123456789, evidenceRequired: true, notesRequired: false, jobIds: [1, 2], retired: false };
const share: Share = {
	id: 1,
	projectId: 1,
	jobId: 1,
	employeeUserId: id,
	amount: 150000,
	note: 'n'.repeat(1000),
	actorUserId: id,
	paid: false,
	at: '2026-11-24T00:00:00.000Z'
};

const longForm: TaskForm = {
	kind: 'tasks',
	tasks: Array.from({ length: 25 }, (_, index) => ({
		taskId: index + 1,
		jobId: 1,
		name: `${longName.slice(0, 90)} (Job ${index})`,
		description: 'Rate $1,234,567.89, no link or file needed, no notes needed'
	})),
	notesRequired: false,
	notesHint: 'What did you do? Required unless the Task says otherwise.',
	linkHint: 'Optional. A link or a file is required unless the Task says otherwise.',
	filesHint: 'Optional screenshots. A link or a file is required unless the Task says otherwise.'
};

// Discord's builders check every limit, such as 100 characters for a field description, only when the form is sent. Building each
// form here runs the same checks, so a too-long text fails a test instead of a button press.
const forms = {
	settings: () => buildSettingsModal(null),
	'settings with a category picked': () => buildSettingsModal(id),
	amend: () => buildAmendModal(99999, { notesRequired: true, notesHint: 'What did you change?' }),
	hire: () => buildHireModal(id),
	link: () => buildLinkModal(id, id, null),
	're-link an Employee': () => buildLinkModal(id, id, 'Alex_42'),
	'new Job': () => buildJobModal(null),
	'edit Job': () => buildJobModal(job(1)),
	'manager roles': () => buildManagerRolesModal(job(1)),
	'new Task': () => buildNewTaskModal(jobs, 1),
	'edit Task': () => buildEditTaskModal(task),
	"Task's Jobs": () => buildTaskJobsModal(task, jobs),
	'new Project': () => buildCreateProjectModal(jobs),
	'fund Project': () => buildFundModal(1, longName),
	'give Share': () => buildGiveShareModal(1, longName),
	'edit Share': () => buildEditShareModal(share),
	'claim ticket': () => buildClaimTicketModal([]),
	request: () => buildRequestModal(longForm, id, id, 'n'.repeat(1000)),
	'request with a link in its notes': () => buildRequestModal(longForm, id, null, `${'n'.repeat(400)} https://example.com/${'x'.repeat(480)}`),
	'claim ticket with a Job to pick': () => buildClaimTicketModal(jobs),
	'claim ticket with its one Job picked': () => buildClaimTicketModal([job(1)]),
	'claim ticket in a home server, number filled in': () => buildClaimTicketModal(jobs, id, '12345'),
	reject: () => buildReasonModal('reject', 99999),
	deny: () => buildReasonModal('deny', 99999)
};

describe('Every form PayMe shows', () => {
	it.each(Object.entries(forms))('passes Discord’s checks: %s', (_, build) => {
		expect(() => build().toJSON()).not.toThrow();
	});
});

describe('The request form', () => {
	function linkField(notes: string | null) {
		const form = buildRequestModal(longForm, id, null, notes).toJSON();
		const label = form.components.find((component) => 'label' in component && component.label === 'Link');
		return label && 'component' in label && 'value' in label.component ? label.component.value : undefined;
	}

	it('fills in the Link with the first link the notes mention, and leaves it empty when they mention none', () => {
		expect(linkField('Built the wall, see https://imgur.com/a/abc123.')).toBe('https://imgur.com/a/abc123');
		expect(linkField('Built the wall')).toBeUndefined();
		expect(linkField(null)).toBeUndefined();
	});
});
