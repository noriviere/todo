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
3. `/mattpocock-skills:to-tickets`: size each ticket to what one fresh session handles comfortably and publish; Noel leaves the split to you.
4. `/mattpocock-skills:implement`, or `/implement-spec` (repo skill, `.claude/skills/implement-spec`) when the spec has several tickets, parallel or in series: it drives one implementer subagent per ticket in its own worktree, merges them into one PR and runs its own review.
5. `/mattpocock-skills:code-review`: give the reviewers the PR body (evidence, screenshots) along with the diff and the issue.
6. `/retro`

Noel launches each skill. Your part is the reminder: when a step finishes (or when a request arrives with no step started), name the next step and give its command exactly as listed above, alone in its own fenced code block (the block's copy button lets Noel paste it in one tap):

```
/mattpocock-skills:code-review
```

At step 4, when `/to-tickets` published more than one ticket, give both commands, each in its own block, and let Noel choose; with a single ticket, give `/mattpocock-skills:implement` alone.

Keep the `/mattpocock-skills:` prefix on steps 1 to 5: the bare `/code-review` launches a different, built-in skill. Inside a plugin skill, « /code-review » means `/mattpocock-skills:code-review`; under `/mattpocock-skills:implement`, skip its closing review, since step 5 runs it with the PR body. Called without an argument, `/mattpocock-skills:code-review` takes `origin/main` as its fixed point. `/retro` and `/implement-spec` are repo skills and take no prefix; project threads often start without the repo's `.claude` folder loaded, so where the session does not offer one, read its `.claude/skills/<name>/SKILL.md` and follow it. During a workflow step, that step's skill leads: superpowers skills that overlap it (brainstorming, writing-plans, subagent-driven-development, requesting-code-review, test-driven-development) are not run on top; the others (verification-before-completion, systematic-debugging, the interface rule below) still apply. Leave the step's own work to the skill. Agent context and tooling changes (this file, CI checks, hooks) skip the six steps and get a thread and a PR of their own: when one comes up in an application thread, ask the coordinator for a separate thread. Exception: a rule of this file that records a decision taken in the thread's spec (a module exception, a new hook) goes in that thread's PR; only independent tooling (CI, hooks, working instructions) gets its own thread.

PR bodies follow the `pr` skill (`.claude/skills/pr`).

## Standing rules

- Every interface change uses the `ui-ux-pro-max` skill and the superpowers skills, and keeps the current visual spirit.
- Archive, never delete: subjects and tasks are archived; no code path removes user data.
- Every module (see `CONTEXT.md`) can be switched off in « Modules actifs », and the app works fully with any module off. A module file gates its display and user-action hooks with `A.modOn('<id>')`; hiding a module never deletes its data. Data-consistency hooks are not gated and stay active with the module off: `hooks.refusRangement` (refuse to put a subject inside another) and `hooks.sortieDuParent` (drop links a subject loses when it leaves its parent).
- Each new function updates the built-in user guide (`guide.js`, sections tagged with their module) and the demo data (`demo.js`), and places its guide marker: the element that gets an « i » carries `data-repere="<section id>"` (« i » at its end) or `data-repere="<section id> après"` (« i » right after it), in the HTML of the screen that draws it. The guide holds no screen selectors; `tests/guide-reperes.test.js` keeps the frozen list of « i » per screen, so a new marker joins that list.
- No real data in this repo: Noel's data syncs to the private repo `noriviere/todo-donnees`. Tests and screenshots use fictitious data or demo mode (`index.html?demo`).
- Deferred improvements live in `docs/ameliorations-repoussees.md`. Whenever you look for improvements (architecture review, retro, cleanup), read it first and start from its open rows. Whenever a grill, review, retro or PR pushes something to later, add a row there (origin and state) in the same PR; when one is done or dropped, strike it with the PR number or the reason.
- Code, comments, interface text, commits and PR titles are in French.
- The interface is designed for phone as well as desktop: check every change at phone width (≈390 px) too. `tests/telephone.test.js` covers page overflow on every screen; a new screen or panel joins its tour.

## Where things are

- `metier.js`: pure domain rules (data and migration, subject state, remaining time, due-date buckets, task order, task field edits, and the calendar: semaine type, fériés, jours ouvrés and travaillés, recurrence shift), taking data and day as parameters; tested under Node in `tests/metier.test.js`. Loaded before the core.
- `index.html`: the core (views, `MODULES` registry, `modOn`, the full ordered tab list `NAV` with each module's tab, relays to `metier.js` that keep the names `todoApp` already exposes). A module provides only its view (`views.<tab>`): it never inserts its tab, and a tab without a view is not shown. It exposes `window.todoApp` with the hooks that module files plug into. A module shows itself through named slots, never by cutting the core's HTML or adding elements after rendering: `hooks.bandeauTableau` (dashboard, after the stats, before the first section), `hooks.debutLigneTache` / `hooks.debutEnteteSujet` (start of a task row / subject header; a module drawing its own task rows calls `A.debutLigneTache(t)`), plus `taskRow`, `dashTop`, `subjectsToolbar`, `subjectBody`, `drawer`. `hooks.apresModif` adds what a modification entails, in the same undo step; `hooks.absence`, filled by Pointage, feeds `A.calendrier()`, the one calendar every module asks. `A.allerA({ vue, tid | sid }, { signalerFiltre })` is the one « aller au sujet » (screen, row unfolded, centred, highlighted; with `signalerFiltre`, « Ce sujet est masqué par un filtre » when a filter hides it): Annuler and modules call it rather than writing their own. The core fires the events `todo:saved`, `todo:rendered`, `todo:modules` and `todo:historique-vide`, which module files listen to. Modules change data only through `A.modifier`; display-only state goes through `A.enregistrerAffichage`.
- One file per module, loaded after the core: `chrono-charge.js` (Chrono, Charge), `pointage.js` + `pointage-import.js` (Pointage et congés), `organisation.js` (dashboard filters, drag-and-drop, Récurrence), `projets.js` + `projets-plan.js` (Gestion de projet; `projets-plan.js` holds the pure planning calculations).
- Data: `sync.js` (sync through the private GitHub repo), `backup.js` (local backup folder), `excel-import.js` (import of the original Excel list). Data lives in `localStorage` key `todo-noel-v1`.
- `guide.js` (user guide), `demo.js` (demo data), `sw.js` (offline cache, network first).
- Tests: `node --test tests/*.test.js` (Playwright on `index.html` via `file://`; helpers in `tests/helpers.js`; the page clock starts on the fixed day `TODAY`). Add `--test-reporter=spec` to see `console.log` output. CI runs the suite on every PR (`.github/workflows/tests.yml`). `.githooks/pre-commit` runs them, and `.githooks/pre-push` refuses a push whose branch does not contain an up-to-date `origin/main` (merge main first); `.claude/hooks/session-start.sh` enables both in cloud sessions, but project threads may start without it: before the first commit, if `git config core.hooksPath` is not `.githooks`, run `git config core.hooksPath .githooks` (once per clone elsewhere). `tests/outillage.test.js` fails outside CI while they are off.
