# Coding standards

Read at review time. Judgement calls only: anything mechanical belongs in a test, the pre-commit hook or CI.

## Tests

- Shared test helpers live in `tests/helpers.js`; a test file reuses them rather than redefining a local copy.
- Page selectors in UI tests are scoped to `#main` (e.g. `#main .pj-gantt`): the PDF print sheet duplicates parts of the screen, the Gantt among them.
- Tests run on the fixed day `TODAY` from `tests/helpers.js`. Dates in test data are either written out (`'2026-11-02'`) or built with `day(n)`, both relative to that day; a test that needs another day passes `openApp(data, { today })`.
- Assert on what the code decides (`data-*` attributes, saved data) rather than on rendered box sizes, which CSS such as `min-width` can clamp.

## Demo data

- Demo dates chained to the project plan are counted in working days (`work(td, n)` in `demo.js`), like the planner, so the demo shows the same thing every weekday.
