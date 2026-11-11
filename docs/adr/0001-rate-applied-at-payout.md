# Rates are applied when a Payout is generated

A Payment Request does not record a Rate when it is submitted or approved. The current Rate for each Task is applied only when Leadership generates a Payout, and at that point it is frozen into the Payout along with the included requests and their total. We chose this so that the Rate Schedule in force on payday is what Employees receive, and so that frozen Payouts guarantee the Pay Command that was run matches what gets marked Paid.

## Consequences

- An Approved request's value is only an estimate until it is included in a Payout. Anything that shows an amount owed before then must label it as an estimate.
- A Rate change after a Payout is generated does not affect that Payout. To pick up the new Rate, Leadership discards the Payout and generates a new one.
- A Retired Task's last Rate still applies to any of its Approved requests that have not been paid yet.
