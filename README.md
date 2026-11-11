# PayMe

PayMe is a Discord bot that takes each Payment Request from submission to payment for Employees on our Minecraft server.

1. An Employee submits a Payment Request with `/request`, choosing one Task and attaching Evidence.
2. A Manager of an eligible Job approves it, rejects it (sends it back for changes) or denies it.
3. Leadership generates a Payout, which locks in the current Rates. PayMe then shows a Pay Command to paste into Minecraft.
4. Leadership runs the command in-game and marks the Payout paid.

Every step is logged in the Employee's Requests Thread, which is the permanent record. PayMe never moves money itself.

Vocabulary follows [GLOSSARY.md](GLOSSARY.md). Design decisions are in [docs/adr/](docs/adr/), and the full spec is GitHub issue #1.

## Commands

| Command | Who | What it does |
|---|---|---|
| `/job create \| edit \| retire \| list \| manager-role add \| manager-role remove` | Leadership | Manage Jobs: each one's Employee role, Review Channel and manager roles |
| `/task add \| rate \| evidence \| notes \| jobs add \| jobs remove \| retire \| restore` | Leadership | Maintain the Rate Schedule |
| `/task list` | Anyone | Show the Rate Schedule |
| `/hire user minecraft` | Leadership | Create the Employee Channel and Requests Thread, and record the Minecraft Name |
| `/link user minecraft channel` | Leadership | Bring in someone who already has a channel, or change their Minecraft Name or channel |
| `/request [job]` | Employee | Submit a Payment Request. Pass `job` when your Jobs have more than 25 Tasks between them |
| Right-click a member → Apps → **Request payment for** | Managers, Leadership | Submit a Payment Request on that Employee's behalf, for Tasks in Jobs they hold and you manage. The Employee still owns it, and the filing Manager can review it |
| `/requests` | Employee | Show your open requests and an estimate of what you're owed |
| `/payouts` | Leadership, Managers | Leadership generates, marks paid and discards Payouts. Managers get a read-only view of Employees in their Jobs |

Approve, Reject and Deny are buttons on each review message in a Review Channel. Amend & resubmit and Withdraw are buttons on each request entry in the Requests Thread. Withdrawing marks that entry Withdrawn and deletes the request's review messages from every Review Channel. A Request payment button on the pinned message in each Employee Channel opens the same form as `/request`. Next to it, Claim ticket asks for a 5-digit DOC ticket number and submits it as a Payment Request for the `DOC Ticket Assistance` Task. The ticket number is the Evidence, and an Employee can't claim the same ticket twice unless their earlier request for it was Denied or Withdrawn. Different Employees can each claim the same ticket.

## Discord setup

PayMe works with roles and channels that already exist. Before starting it:

- Create the Leadership role, each Job's Employee and manager roles, each Job's Review Channel, and a category for Employee Channels.
- In the Discord developer portal, turn on the **Server Members** privileged intent.
- Give the bot these permissions: Manage Channels, Manage Roles, Manage Messages, Pin Messages, Embed Links, Create Public Threads, Send Messages in Threads, Manage Threads and Attach Files.

## Running it

You need Node 24 and pnpm. PayMe stores data in SQLite through `better-sqlite3`, a native module that pnpm builds on install.

```sh
pnpm install
```

Put real values in `src/.env.local`, which is gitignored. `src/.env` lists the variables:

| Variable | Required | Value |
|---|---|---|
| `DISCORD_TOKEN` | yes | The bot token |
| `GUILD_ID` | yes | The server ID |
| `LEADERSHIP_ROLE_ID` | yes | The Leadership role ID |
| `EMPLOYEE_CHANNEL_CATEGORY_ID` | yes | The category new Employee Channels are created in |
| `DATABASE_PATH` | no | SQLite file path. Defaults to `payme.db` in the project root |

The bot refuses to start if a required variable is missing. Database migrations run automatically on startup.

```sh
pnpm watch:start   # development: rebuild and restart on change
pnpm build && pnpm start   # production
```

## Development

```sh
pnpm test        # Vitest
pnpm typecheck
pnpm lint        # Prettier check (pnpm format to fix)
```

Code layout:

- `src/core/` is the PayMe domain core and has no Discord imports. Each operation takes the acting member as plain data and returns an outcome describing the Discord effects to carry out, or a typed error.
- `src/storage/` holds the Drizzle schema (`schema.ts`), the queries built on it, and the versioned SQL migrations. A schema change needs both a new migration and a matching edit to `schema.ts`.
- `src/discord/` contains the runner, which carries out effects, plus shared Discord helpers.
- `src/commands/`, `src/interaction-handlers/` and `src/listeners/` are thin Sapphire pieces that call the core.

Tests in `tests/` exercise the core through its public operations against an in-memory database. The Discord layer has no automated tests, so check it by hand on a test server.

Create new Sapphire pieces with the CLI, for example `pnpm sapphire generate slashcommand <name>`.

## License

[Unlicense](https://unlicense.org/).
