# PayMe

PayMe is a Discord bot that takes each Payment Request from submission to payment for Employees on our Minecraft server.

1. An Employee submits a Payment Request with `/request`, choosing one Task and attaching Evidence.
2. A Manager of the request's Job approves it, rejects it (sends it back for changes) or denies it.
3. Leadership generates Payouts from the dashboard in #payouts, which locks in the current Rates. PayMe then shows a Pay Command for each one to paste into Minecraft.
4. Leadership runs each command in-game and marks its Payout paid.

Every step is logged in the Employee's Requests Thread, which is the permanent record. PayMe never moves money itself.

Vocabulary follows [GLOSSARY.md](GLOSSARY.md). Design decisions are in [docs/adr/](docs/adr/), and the full spec is GitHub issue #1.

## Commands

| Command | Who | What it does |
|---|---|---|
| `/hire user minecraft` | Leadership | Create the Employee Channel and Requests Thread, and record the Minecraft Name |
| Right-click a member → Apps → **Hire as Employee** | Leadership | Same as `/hire`, asking for the Minecraft Name in a form |
| `/link user minecraft channel` | Leadership | Bring in someone who already has a channel, or change their Minecraft Name or channel |
| `/request [job]` | Employee | Submit a Payment Request. When your Jobs have more than 25 Tasks between them, PayMe asks you to pick a Job first; pass `job` to skip that step |
| Right-click a member → Apps → **Request payment for** | Managers, Leadership | Submit a Payment Request on that Employee's behalf, for Tasks in Jobs they hold and you manage. As with `/request`, you pick a Job first when those Tasks don't fit on one form. It is Approved at once, with no review copy, and the Employee still owns it |
| Right-click a message → Apps → **Request payment** | Employee | Request payment for yourself, with the message's text filled in as the notes, whoever sent it, and its first link filled in as the Link. It goes to Pending review like `/request`. Pick the Task and add any link or files yourself. To file for someone else, use **Request payment for** on the member |
| Right-click a message → Apps → **Claim ticket** | Employee | Claim a DOC ticket: pick the Job and enter its 5-digit number, which is filled in when the message mentions one, such as the ticket's own message. Works like the Claim ticket button in your Employee Channel, and everywhere when PayMe is your user app |
| Right-click a message → Apps → **Link Employee** | Leadership | Link the message's author to the channel it was sent in, as with `/link`: PayMe asks only for their Minecraft Name, filled in if they are already an Employee. A message in a thread counts as its channel's. Use it to bring existing Employee Channels into PayMe. Linking, with this or `/link`, also sets who can see the channel: the Employee and the manager roles of their Jobs are let in, and every other role, @everyone included, loses sight of it. Other permissions are left as they are, and administrators always see it. An existing channel must let PayMe's role in first: if it can't see the channel or change its permissions, PayMe says which permissions to give it there and links nothing |
| `/requests` | Employee | Show your open requests and an estimate of what you're owed |
| `/project create \| fund \| close` | Leadership | Create a Project for a Job with an opening Budget, add to its Budget in later pay periods, or close it |
| `/project share project employee amount [note]` | Managers, Leadership | Give an Employee who holds or manages the Project's Job, yourself included, a Share of what is left of its Budget. The Share is owed at once and goes into their next Payout |
| `/project share-edit share [amount] [note]` \| `share-remove share` | Managers, Leadership | Change or remove a Share that has not been paid out. A Share in an Open Payout can't change until Leadership discards that Payout |
| `/project show \| list` | Managers, Leadership | Show a Project's Budget, what is left and every Share, for Projects of Jobs you manage |
| `/rates-channel set channel` \| `unset` | Leadership | Keep every active Job's Tasks and Rates posted in a channel, one embed per Job. PayMe edits those messages whenever a Task, Rate or Job changes. Setting another channel moves the Rates there; unsetting deletes PayMe's messages |
| `/payouts` | Leadership, Managers | Leadership generates or updates, marks paid and discards Payouts one Employee at a time. Managers get a read-only view of Employees in their Jobs |
| `/home-server` | Anyone | Choose which PayMe server your requests go to when you use PayMe as a user app outside its servers. See [As a user app](#as-a-user-app) |

Approve, Reject and Deny are buttons on each review message in a Review Channel. Amend & resubmit and Withdraw are buttons on each request entry in the Requests Thread. Withdrawing marks that entry Withdrawn and deletes the request's review messages from every Review Channel. A Task in more than one of the Employee's Jobs appears on the request form once per Job, like `Load Cart (Courier)` and `Load Cart (Miner)`, and the request goes to that Job's Review Channel only. A Request payment button on the pinned message in each Employee Channel opens the same form as `/request`. When a Manager or Leadership presses it in another Employee's channel, the form is for that Employee, as with **Request payment for**. Next to it, Claim ticket asks for the Job and a 5-digit DOC ticket number and submits it as a Payment Request for the `DOC Ticket Assistance` Task. The Job is picked already when only one of yours has that Task. The ticket number is the Evidence, and an Employee can't claim the same ticket twice unless their earlier request for it was Denied or Withdrawn. Different Employees can each claim the same ticket.

Projects can also be managed without the subcommands. `/project list` has a menu to open a Project and, for Leadership, a New Project button that asks for its name, Job and opening Budget. An Open Project shown with `/project show` or from that menu has Give Share and Change Share buttons, plus Add funding and Close for Leadership. Give Share asks for the Employee, amount and note. Change Share lets you pick an unpaid Share, then change its amount or note or tick Remove this Share. Close asks you to confirm.

Jobs and Tasks have no commands: Leadership manages them from the dashboard below. Employees see the Rates in the Rates Channel.

PayMe keeps a category called **Payment Review**, finding it by name (any capitalisation) or creating it on startup. In it, PayMe creates **#payouts**, private to administrators, and a Review Channel for each Job it creates, named after the Job like `#courier-review` and visible to the Job's manager roles and administrators. A channel with that name already in the category is reused, with PayMe and those roles let in. New Employee Channels go in a category called **Employees**, which PayMe finds or creates the same way, until an administrator picks another with the dashboard's Settings button. Changing a Job's manager roles changes who can see its Review Channel, and renaming the Job renames the channel.

PayMe pins a dashboard in #payouts. It shows how many requests are pending review and what is owed for each Job, every Open Payout waiting to be marked paid, and what is left in each Open Project, and it updates a couple of seconds after anything changes. Everything it opens is private to whoever pressed it:

- **Generate Payouts** generates a Payout for every Employee who is owed something, then shows each one with its Pay Command and Mark paid and Discard buttons. An Employee who already has an Open Payout keeps its number, and it is updated to take in anything owed since and the current Rates. Run the Pay Command from the latest version only: Mark paid and Discard on a message showing an older version are refused.
- **Projects** opens the same view as `/project list`.
- **Jobs** lists every Job, with a menu to open one and a New Job button that asks for its name and Employee role. An open Job has Edit, Manager roles, and Retire, which asks you to confirm.
- **Tasks** shows the Rate Schedule with a menu to pick a Job, then one of that Job's Tasks. New Task asks for the name, Rate, Jobs, and whether requests need a link or file and notes. An open Task has Edit (Rate and requirements), Jobs and Retire, and a Retired one has Jobs and Restore.
- **Settings** picks the category new Employee Channels are created in.
- The member picker below the buttons opens the request form for that Employee, as with **Request payment for**.

PayMe finds its pinned dashboard again on restart, and posts a new one if it was deleted or unpinned.

## Discord setup

PayMe can be added to any number of servers. Each server's data is kept in its own database, and nothing is shared between servers. Leadership on a server is everyone with Discord's **Administrator** permission there.

- In the Discord developer portal, turn on the **Server Members** privileged intent.
- Invite the bot with these permissions: Manage Channels, Manage Roles, View Channels, Send Messages, Read Message History, Embed Links, Attach Files, Manage Messages, Pin Messages, Create Public Threads, Send Messages in Threads and Manage Threads. Discord refuses to let PayMe create a channel if its role lacks any of them, so PayMe logs the missing ones by name when it joins or starts. Giving its role Administrator also works.
- To bring in Employee Channels that already exist, make sure PayMe's role can see each one and has Manage Permissions in it, or give the role Administrator. A private channel or category that hides it from PayMe's role blocks linking, and PayMe names the missing permissions when you try.
- Create each Job's Employee and manager roles. PayMe creates the Payment Review and Employees categories, #payouts and each Job's Review Channel itself, as soon as it joins a server.

### As a user app

PayMe can also be installed on a member's own Discord account, so they can request payment from any server or DM, including ones PayMe isn't in. Turn on **User Install** under Installation in the Discord developer portal, with the `applications.commands` scope. Installed that way, `/request`, **Request payment** and **Claim ticket** on a message, and **Request payment for** on a member work everywhere, and `/home-server` is added. The rest of PayMe stays inside its servers.

A request made outside a PayMe server goes to the user's **home server**: a PayMe server where the person the request is for is an Employee and the person filing is a member. With one such server, PayMe uses it. With several, PayMe asks once and remembers the choice, which `/home-server` changes. PayMe always uses the roles and permissions the user has in the home server, and posts the request there. In a PayMe server itself, requests stay in that server as before.

Each user's home server is kept in `data/app.db`, apart from every server's own database.

## Running it

You need Node 24 and pnpm 11. PayMe stores data in SQLite through `better-sqlite3`, a native module that pnpm builds on install.

```sh
pnpm install
```

PayMe needs no configuration file. Set the bot's token in the environment, either directly or in `src/.env.local`, which is gitignored:

| Variable | Required | Value |
|---|---|---|
| `DISCORD_TOKEN` | yes | The bot token |
| `DATA_DIR` | no | Where each server's database is kept, as `<server id>.db`, along with `app.db`. Defaults to `data` in the project root, and to `/data` in the Docker image |

The bot refuses to start without `DISCORD_TOKEN`. Database migrations run automatically for each server's database.

```sh
pnpm watch:start   # development: rebuild and restart on change
pnpm build && pnpm start   # production
```

### With Docker

Every push to `main` and every version tag like `v1.2.0` publishes an image to the GitHub Container Registry, built for amd64 and arm64 after typecheck, lint and tests pass. Pull requests build the image without publishing it.

```sh
docker run -d --name payme --restart unless-stopped \
  -e DISCORD_TOKEN=your-token \
  -v payme-data:/data \
  ghcr.io/doc-infra/payme-bot:latest
```

Keep `/data` on a volume: it holds every server's database and `app.db`, so they survive new images. Back it up. PayMe only connects out to Discord, so the container needs no published port. The image runs as the unprivileged `node` user. Tags are `latest` for `main`, `1.2.0` and `1.2` for version tags, and `sha-<commit>` for every build. To build the image yourself, run `docker build -t payme .`.

If the package is private, which is the default for an organisation's images, log in before pulling with `docker login ghcr.io`, using a personal access token with the `read:packages` scope.

#### With Docker Compose

Save this as `compose.yaml`:

```yaml
services:
  payme:
    image: ghcr.io/doc-infra/payme-bot:latest
    restart: unless-stopped
    environment:
      DISCORD_TOKEN: ${DISCORD_TOKEN}
    volumes:
      - payme-data:/data

volumes:
  payme-data:
```

Put the token in a `.env` file next to it, which Compose reads for `${DISCORD_TOKEN}`. Keep that file out of version control.

```sh
echo 'DISCORD_TOKEN=your-token' > .env
docker compose up -d        # start
docker compose logs -f      # follow the logs, including missing-permission warnings
docker compose pull && docker compose up -d   # update to the newest image
```

To keep the databases in a folder you can see and back up, replace `payme-data:/data` with a path like `./data:/data`, and make that folder writable by the container's `node` user (user ID 1000), for example with `sudo chown 1000:1000 data`. Pin a tag like `ghcr.io/doc-infra/payme-bot:1.2.0` instead of `latest` to update only when you choose.

## Development

```sh
pnpm test        # Vitest
pnpm typecheck
pnpm lint        # Prettier check (pnpm format to fix)
```

Code layout:

- `src/core/` is the PayMe domain core and has no Discord imports. Each operation takes the acting member as plain data and returns an outcome describing the Discord effects to carry out, or a typed error.
- `src/storage/` holds the Drizzle schema (`schema.ts`), the queries built on it, and the versioned SQL migrations. A schema change needs both a new migration and a matching edit to `schema.ts`. Each server's database uses these; `app.ts` is the separate app-wide database of users' home servers.
- `src/discord/` contains the runner, which carries out effects in the right server, plus shared Discord helpers: `servers.ts` opens each server's database, `serverSetup.ts` prepares a server when PayMe starts or joins it, and the dashboard, Rates Channel, management forms and home servers each have their own module.
- `src/commands/`, `src/interaction-handlers/` and `src/listeners/` are thin Sapphire pieces that call the core.

Tests in `tests/core/` exercise the core through its public operations against an in-memory database. Tests in `tests/discord/` cover the parts of the Discord layer that need no connection: custom IDs, choosing a home server, and every form passing Discord's own limits. The rest of the Discord layer has no automated tests, so check it by hand on a test server.

GitHub Actions runs typecheck, lint and tests on every push and pull request, then builds the Docker image (see `.github/workflows/image.yml`).

Create new Sapphire pieces with the CLI, for example `pnpm sapphire generate slashcommand <name>`.

## License

[Unlicense](https://unlicense.org/).
