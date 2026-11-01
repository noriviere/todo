# Coding standards

Read at review time. Judgement calls only: anything mechanical belongs in a test, the pre-commit hook or CI.

## Tests

- Shared test helpers live in `tests/helpers.js`; a test file reuses them rather than redefining a local copy.
- Page selectors in UI tests are scoped to `#main` (e.g. `#main .pj-gantt`): the PDF print sheet duplicates parts of the screen, the Gantt among them. `tests/outillage.test.js` enforces it, with its list of allowed zones.
- Tests run on the fixed day `TODAY` from `tests/helpers.js`. Dates in test data are either written out (`'2026-11-02'`) or built with `day(n)`, both relative to that day; a test that needs another day passes `openApp(data, { today })`.
- Assert on what the code decides (`data-*` attributes, saved data) rather than on rendered box sizes, which CSS such as `min-width` can clamp.

- Each acceptance criterion of the ticket has a test that proves it; the PR body ticks each criterion with that test's name. An unticked criterion is a review finding.
- Each story of the spec that describes a behaviour the diff changes or protects has a test, even when the ticket left it out of its criteria; a story without a test is a review finding.
- Red-first evidence for a test lives in the PR body (the test's output before the fix): the pre-commit hook rejects a commit with a failing test, so history never shows the red run.

## Domain rules

- A domain rule lives once, in `metier.js`; a module calls it through `window.todoApp` rather than keeping its own copy. `tests/outillage.test.js` catches the known copies of date rules (semaine type, lundi, Pâques).
- Changed interface text uses the `CONTEXT.md` terms. For each concept the diff touches, search the whole repo (not only the diff) for that entry's _À éviter_ terms in interface text.

## Demo data

- Demo dates chained to the project plan are counted in working days (`work(td, n)` in `demo.js`), like the planner, so the demo shows the same thing every weekday.
