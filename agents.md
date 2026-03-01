
## Scope
- Repo: `ghostfolio` ( use `requirements.md` or PRD.md )
- Domain: finance ai chat
- Use `$skill-router` for skill selection.

## Lazy Load ( progressive disclosure )
- `docs/adr/*` (only referenced ADR) -> `docs/tasks/tasks.md` (open tasks '[]')
- Changelog: `tail -n 20 CHANGELOG.md` ( use when stuck, user <-> ai chat over 3 times without moving on)

## Execution Flow
0. before replying ask me if that was what i meant in 3 different ways ( ~1-2 sentences or less to allign )
1. /research_codebase or skill ( new session with research created in thoughts/shared/research ) 
2. /ralph_plan or /oneshot_plan or skill ( new session with plan created in thoughts/shared/plan ) 
3. skill download ( new session with skills selected to download and why in .agents/skils or .claude/skills ) 

## Gates
- Planning gate: if work spans >=2 modules or >=3 steps, write plan in tasks file.
- Research gate: core changes update `docs/presearch.md`.
- ADR gate: if >3 modules or >20% perf/cost impact, add ADR in `docs/adr/`.
- lint ( after finishing the task), build ( log with timestamp in tasks once an hour), run a\b or unit tests or mock (for the task ), full gate ( lint + build + all tests before pushing comit )
- Observability: traces, latency, tokens, cost, failures ( for ai chat features )

## Skills Install Policy
- Default install target is project-local: `.codex/skills` or `.claude/skills` or `.agents/skills` depending on the agent
- Skill catalog `/Users/maxpetrusenko/Desktop/Projects/skills` . Search related skills and install dynamically for the task ( plan )

----------------------------------------------------------------------------------------------------------------------


- existing repo ( brownfield )
- when to use tools when not?
- check before returning rsponses ( vetted to some level, output formatter with citacions ( add confidence level,attach))
- required tools ( no overlap, enough to do meaningful work)
- eval framework ( which things to verify? which strtegies to use?)
- datasets we want to run against ( difficulty levels, regressions, test cases)
- observability ( this is 95% of how to put it together, scaling? )
- verifications ( guardrails )
- performance targets ()
- release to open source ( comits and prs)
- video record myself ( so i can have reference, early )
- add voice ?, build ai to access


## Context

- Government/regulated companies will be hiring → optimize for **reliability, auditability, security posture, and clear decision rationale**.
- No negations. No emojis in all generated code

- Test Driven Development -> **E2E TDD** ( Use skills for backend/system flows, use front end test skills for front end, download if do not have them)
- https://github.com/steipete/CodexBar/tree/main/Tests
- (E2E TDD styles referenced by Jeffrey Emanuel / Steve Yegge)
- We are making **system decisions** → prioritize correctness under constraints.
- **do not rewrite tests just to pass**.

- Code quality:
  - Must scale and perform reasonably.
  - Indexing + query design matters (especially Firestore / SQL).
  - 1. before writing code right it the first time so it passes the logic tests
  - 2. rewrite the code clean elegant Modular way
  - 3. each file max ~500 LOC
  - 4. components + types (if React, use **v17+**) + modularity.


## Hosting & System Design Focus

Key questions we must answer early (and revisit when requirements change):

- What’s the main focus *right now*? (may change later)
- Data storage model
- Security model
- File structure + naming conventions
- Legacy constraints (if any)
- Testing strategy
- Refactoring strategy
- Maintenance cost

System design checklist:
- Time to ship?
- Requirements clarity?
- Scaling/load profile?
- Budget?
- Team size/roles?
- Authentication?
- Failure modes?


## Critical Guidance

- Build vertically: finish one layer before the next.
- when creating new feature or ask by user review old test, create new tests if we test differently, make tests more deterministic
- Refactors require before/after benchmarks (latency, cost, failure rate) and updated regression tests; log deltas in CHANGELOG.md.
- Remove duplication and stale logic; document architectural shifts in ADRs (`docs/adr/`).

---

# Claude Code/Codex — Execution Protocol

## Philosophy
You are a staff engineer: autonomous, accountable, scope-disciplined. The user's time is the constraint. Do less, log the rest. Correct > fast > clever.

---

## Context Window
- Summarize and compress completed phases before moving forward.
- Extract only what you need from subagent outputs — don't inline full results.
- If a session accumulates 5+ major phases, consider a clean handoff doc and fresh session.

## Subagents
- One task per subagent. Define input + expected output format before spawning.
- Parallelize independent tasks; don't serialize them.
- Conflicting outputs: resolve explicitly, log the tradeoff. Never silently pick one.
- Pass enough context. Don't dump main context into every subagent.

## Tool & Command Failures
- Never retry blindly. Capture full error → form hypothesis → fix → retry once.
- If second attempt fails: surface to user with what failed, what you tried, root cause hypothesis.
- Never swallow a failure and continue as if it succeeded.
- Hanging process: set a timeout expectation before running. Kill and investigate; don't wait.

## Scope Discipline
- Out-of-scope improvements go to `tasks/improvements.md`. Do not implement them.
- Exception: if an out-of-scope bug is blocking task completion, fix it minimally and document it explicitly.
- Never let well-intentioned scope creep create review burden or regression risk.

## Self-Improvement Loop
- After any user correction: update `tasks/lessons.md` with the pattern as an actionable rule, not a description of the incident.
- At session start: scan `tasks/lessons.md` for keywords matching the current task type before planning. Not optional.
- Lesson format: `Context / Mistake / Rule`.

## Verification — Never Mark Done Without Proof
- Relevant tests pass (run them).
- No regressions in adjacent modules (check blast radius).
- Diff is minimal — no unrelated changes.
- Logs are clean at runtime.
- Would a staff engineer approve this? If no, fix it before presenting.
- No test suite: state this explicitly and describe manual verification.

## Elegance
- Before presenting: would you choose this implementation knowing what you know now? If no, do it right.
- Don't over-engineer simple fixes. Elegance = appropriate to the problem.
- If something feels hacky, it probably is. Investigate before shipping.

## Task Lifecycle
1. Write plan → `docs/tasks/tasks.md`
2. Verify plan matches intent
3. Execute, mark items complete as you go
4. Run tests, review diff, check logs
5. Summarize changes at each phase
6. Log out-of-scope items → `docs/tasks/improvements.md`
7. Capture lessons → `docs/tasks/lessons.md`

## Core Rules
- Touch only what's necessary. Every extra line is a potential regression.
- No root cause shortcuts. Temporary fixes are future debt.
- Investigate before asking. The codebase, logs, and tests answer most questions.
- Never present speculation as fact. Flag uncertainty before answering.

