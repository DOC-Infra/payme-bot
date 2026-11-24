# PayMe

Employees claim pay for completed Tasks by submitting evidence. Managers review the claims, and Leadership pays them out in-game through the government commerce account.

## People

**Job**:
A line of work defined by Leadership. Each Job has its own Discord role for Employees and one or more Discord roles for its Managers.
_Avoid_: Department, position, team

**Employee**:
A server member who holds one or more Jobs, determined by their Discord roles. Employees complete Tasks and submit Payment Requests.
_Avoid_: Worker, user, member

**Minecraft Name**:
The in-game username an Employee is paid to. Only Leadership sets or changes it.
_Avoid_: IGN, username, account

**Employee Channel**:
A private channel for one Employee, created when they are hired and visible only to that Employee, the Managers of their Jobs, and Leadership. It holds that Employee's Requests Thread.
_Avoid_: DM, inbox, ticket

**Requests Thread**:
The single thread in an Employee Channel, started from a pinned message, that is the permanent record of all of that Employee's Payment Requests, their Evidence, every review outcome and every Payout.
_Avoid_: Log, history, request thread (one per request)

**Manager**:
A server member who manages one or more Jobs, determined by that Job's manager roles. Managers review Payment Requests for Tasks in Jobs that they manage and that the requesting Employee holds, can submit Payment Requests on behalf of Employees under those Jobs, which are Approved at once, and can view Payouts but not create or settle them. A Manager may not review their own Payment Request.
_Avoid_: Reviewer, approver, mod

**Leadership**:
The server members with Discord's Administrator permission on the server. Leadership is the same across all Jobs. Leadership defines Jobs, hires Employees, sets Minecraft Names, maintains the Rate Schedule and pays Employees for Approved Payment Requests. Leadership can also do everything a Manager can, for every Job.
_Avoid_: Senior Manager, admin, payer, owner

## Work and pay

**Task**:
A predefined kind of work that an Employee can be paid for. A Task belongs to one or more Jobs and has one Rate. By default its Payment Requests need notes and a link or a file as Evidence; Leadership can waive either requirement per Task.
_Avoid_: Job, assignment, activity

**Rate**:
The amount paid for one completion of a Task: a plain number that may include decimals, with no currency symbol. The Rate that counts is the one in effect when the Payout is generated.
_Avoid_: Price, wage, fee

**Rate Schedule**:
The full list of Tasks and their current Rates, maintained by Leadership.
_Avoid_: Price list, catalog

**Retired Task**:
A Task that can no longer be requested but still exists so that past Payment Requests can refer to it. Leadership can restore it, which makes it requestable again with the same name, Rate and Jobs.
_Avoid_: Deleted task, archived task

**Payment Request**:
An Employee's claim to be paid for exactly one completion of one Task under one Job, backed by Evidence. When the Task belongs to more than one of the Employee's Jobs, the Employee picks the Job the work was for, and only that Job's Managers review it. A Manager of one of the Employee's Jobs, or Leadership, can submit it on the Employee's behalf, which approves it at once; it still belongs to the Employee.
_Avoid_: Claim, submission, ticket, invoice

**Review Channel**:
A Job's channel where its Managers review Payment Requests. Each request appears there with a copy of its Evidence, so reviewers never need to open the Employee Channel.
_Avoid_: Queue, approvals channel

**DOC Ticket**:
A support ticket in the server's DOC ticketing system, identified by a 5-digit number. An Employee who helped with one claims it with a Payment Request for the DOC Ticket Assistance Task, and can claim each DOC Ticket only once unless that request was Denied or Withdrawn.
_Avoid_: Ticket on its own, when it could be confused with a Payment Request

**Evidence**:
Screenshots, links or notes attached to a Payment Request to show that the Task was completed.
_Avoid_: Proof, attachments

**Project**:
A piece of work for one Job that Leadership pays for with a Budget instead of per-Task Rates. Its Job's Managers give Shares of the Budget to Employees who hold or manage that Job, themselves included. A closed Project takes no more funding or Shares.
_Avoid_: Contract, campaign, bounty

**Budget**:
The total Leadership has funded a Project with. Leadership can add to it at any time, for example in each pay period while the Project runs. What has not been given as Shares yet stays available.
_Avoid_: Pool, fund, allowance

**Share**:
A fixed amount of a Project's Budget that a Manager gives one Employee. It is owed as soon as it is given and is paid in the Employee's next Payout. Until it is paid or locked in an Open Payout, the Project's Managers can change its amount or remove it, which returns the amount to the Budget.
_Avoid_: Allocation, cut, bonus

### Payment Request states

**Pending**:
The state of a Payment Request that is waiting for a Manager's review.

**Approved**:
The state of a Payment Request after a Manager accepts its Evidence, or from the start when a Manager or Leadership submitted it on the Employee's behalf. Approved requests are owed but not yet paid.

**Rejected**:
The state of a Payment Request that a Manager has sent back with a required reason saying what to change. The Employee can amend it and resubmit it, which returns it to Pending.
_Avoid_: Declined, returned

**Denied**:
A final state: a Manager has refused the Payment Request with a required reason, and it cannot be resubmitted.
_Avoid_: Rejected, cancelled

**Withdrawn**:
A final state: the Employee has retracted the Payment Request while it was Pending or Rejected.
_Avoid_: Cancelled, deleted

**Paid**:
A final state: the Payout that includes the Payment Request has been marked paid.

### Paying

**Payout**:
A snapshot, taken when Leadership generates a Pay Command, of one Employee's Approved Payment Requests together with their Rates, their unpaid Shares and the total at that moment. Marking it paid makes those requests Paid and those Shares paid. Discarding it leaves the requests Approved and the Shares owed.
_Avoid_: Batch, payroll, payment run

**Pay Command**:
The in-game command, in the form `/gov payout GovCommerce <to> <amount> [reason]`, that settles one Payout.
_Avoid_: Payment, transfer
