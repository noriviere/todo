---
name: implement-spec
description: "Implement a whole spec and its tickets as one PR, with parallel implementer subagents."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The goal is a PR which implements the entire spec on a single branch.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** should be run in the background where possible for **maximum concurrency**.

## In this repo

- The spec is a GitHub issue on `noriviere/todo`; its tickets are its sub-issues, and a ticket's blockers are its native issue dependencies (or a `Blocked by:` line). See `docs/agents/issue-tracker.md`.
- The PR branch is the session's designated branch. Every subagent pointer includes `AGENTS.md` (standing rules: modules off, guide and demo, phone width, French, `ui-ux-pro-max` for interface changes).
- Each implementer works the way `/mattpocock-skills:implement` does: `/mattpocock-skills:tdd` at the seams agreed in the spec, single test files while working, the full suite (`node --test tests/*.test.js`) before handing back.
- Each implementer's brief says: every story of the spec that the ticket touches has a test, even when the ticket's criteria leave it out (`CODING_STANDARDS.md` › Tests).
- Each implementer's brief also says: a criterion that cannot be tested at the planned seam is tested at a lower one (prior art: `tests/depot-github.test.js` intercepts GitHub with `page.route`, even from a `file://` page); a criterion left untested is reported back as a gap, never as done.
- `.githooks/pre-commit` runs the suite on every commit, in worktrees too, once `git config core.hooksPath` is `.githooks` (set it before the first subagent starts; worktrees share it); never bypass it. `.githooks/pre-push` refuses a branch that does not contain an up-to-date `origin/main`: merge it first.

## Steps

1. Read the spec and tickets. Read enough to understand the task graph.

2. (optional) Use an **exploration subagent** to conduct any exploration required by the tickets - relevant codebase files or external documentation. Ensure the exploration subagent can save files - it should save its markdown notes in a directory outside the repo (the session scratchpad), accessible by all future subagents. This lets **implementer subagents** focus on implementation rather than exploration.

3. Create the branch, and a draft PR. Its body follows the `pr` skill (`.claude/skills/pr`) and ends with one `Closes #<n>` line for the spec and for each ticket.

4. Use **implementer subagents** to implement each ticket on the frontier. Each implementer subagent should work in its own worktree (Agent tool, `isolation: "worktree"`), on its own branch.

5. Once an **implementer subagent** completes, merge its work to the PR branch with a **merger subagent**. The merger resolves conflicts with `/mattpocock-skills:resolving-merge-conflicts` and runs the full suite after the merge.

6. If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

7. Once all tickets are complete, update the PR body with the evidence (each ticket's acceptance criteria ticked with their tests, screenshots at desktop and phone width for interface changes, using demo mode `index.html?demo`). Then run `/mattpocock-skills:code-review` on the PR branch (never the bare `/code-review`), giving the reviewers the PR body, the diff, the spec and the tickets. Fix all issues raised by the code review in a single **implementer subagent**.

8. Push, and mark the PR as ready for review. Never merge it: Noel merges.

9. Clean up all **implementer subagent** worktrees and their branches.
