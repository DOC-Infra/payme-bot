# CLAUDE.md

## Sapphire components

Prefer the Sapphire CLI for creating new pieces over hand-writing them: `pnpm sapphire generate <component> <name>`. Output locations come from `.sapphirerc.yml`. Available components: `slashcommand`, `messagecommand`, `contextmenucommand`, `listener`, `precondition`, `argument`, `route`, `buttoninteractionhandler`, `modalinteractionhandler`, `selectmenuinteractionhandler`, `autocompleteinteractionhandler`.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on DOC-Infra/payme-bot, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five triage labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
