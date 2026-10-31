# AGENTS.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `noriviere/todo`; tickets are created by `/to-tickets`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Workflow

Adding or changing an application function: one thread per change, running these skills in order, none skipped:

1. `/mattpocock-skills:grill-with-docs`
2. `/mattpocock-skills:to-spec`
3. `/mattpocock-skills:to-tickets`
4. `/mattpocock-skills:implement`
5. `/mattpocock-skills:code-review`
6. `/retro`

Noel launches each skill. Your part is the reminder: when a step finishes (or when a request arrives with no step started), name the next step and give its command alone in a code block so Noel can copy it. Leave the step's own work to the skill. Agent context and tooling changes (this file, CI checks, hooks) need no thread of their own.

PR bodies follow the `pr` skill (`.claude/skills/pr`).

## Standing rules

- Every interface change uses the `ui-ux-pro-max` skill and the superpowers skills, and keeps the current visual spirit.
- Archive, never delete: subjects and tasks are archived; no code path removes user data.
- Every module (see `CONTEXT.md`) can be switched off in « Modules actifs », and the app works fully with any module off. A module file gates its hooks with `A.modOn('<id>')`; hiding a module never deletes its data.
- Each new function updates the built-in user guide (`guide.js`, sections tagged with their module) and the demo data (`demo.js`).
- No real data in this repo: Noel's data syncs to the private repo `noriviere/todo-donnees`. Tests and screenshots use fictitious data or demo mode (`index.html?demo`).
- Code, comments, interface text, commits and PR titles are in French.
- The interface is designed for phone as well as desktop: check every change at phone width (≈390 px) too.

## Where things are

- `index.html`: the core (data model, views, `MODULES` registry, `modOn`). It exposes `window.todoApp` with the hooks and events (`todo:saved`, `todo:rendered`, `todo:modules`) that module files plug into.
- One file per module, loaded after the core: `chrono-charge.js` (Chrono, Charge), `pointage.js` + `pointage-import.js` (Pointage et congés), `organisation.js` (dashboard filters, drag-and-drop, Récurrence), `projets.js` + `projets-plan.js` (Gestion de projet; `projets-plan.js` holds the pure planning calculations).
- Data: `sync.js` (sync through the private GitHub repo), `backup.js` (local backup folder), `excel-import.js` (import of the original Excel list). Data lives in `localStorage` key `todo-noel-v1`.
- `guide.js` (user guide), `demo.js` (demo data), `sw.js` (offline cache, network first).
- Tests: `node --test tests/*.test.js` (Playwright on `index.html` via `file://`; helpers in `tests/helpers.js`). `.githooks/pre-commit` runs them; cloud sessions enable it automatically (`.claude/hooks/session-start.sh`), elsewhere run `git config core.hooksPath .githooks` once per clone.
