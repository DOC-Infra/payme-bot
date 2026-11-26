# Spend counts in the month a payment is marked paid

Money counts against a month's Appropriation only when it leaves the account: a Payout in the month it is marked paid, and a Disbursement in the month it is paid. Months are calendar months in UTC. Approving a Payment Request, giving a Share, funding a Project, generating a Payout or requesting a Disbursement is not Spend. We chose this because the authority that grants the Appropriation sees what was paid, and because the amount of an Approved request is only an estimate until its Payout is generated (ADR 0001).

## Consequences

- What is owed but unpaid is shown as Committed, and Project money not yet given as Shares as Reserved. Neither belongs to a month, and both describe only the present, so past months show Spend alone.
- A Payout generated in one month and marked paid in the next counts in the later month.
- A Disbursement recorded as already paid counts in the month of the date Leadership gives, which may be in the past.
- Voiding a Paid Disbursement removes it from Spend in its month, so past months can change. Voided Disbursements stay in reports so the change is visible.
