# Lessons

Updated: 2026-02-24

## Context / Mistake / Rule

1. Context: Documentation updates during rapid iteration
   Mistake: File path assumptions drifted across turns
   Rule: Verify target files with `find` and `wc -l` immediately after each save operation.

2. Context: Mixed policy documents (`agents.md`, `CLAUDE.md`, project requirements)
   Mistake: Source-of-truth order remained implicit
   Rule: Anchor task execution to `docs/requirements.md`, then align secondary operating docs to that baseline.

3. Context: AI endpoint review for MVP hardening
   Mistake: Utility regex and service size limits were under-enforced during fast delivery
   Rule: Add deterministic edge-case tests for parser heuristics and enforce file-size split before declaring MVP complete.

4. Context: Local MVP validation with UI-gated features
   Mistake: Test instructions skipped the exact in-app location and feature visibility conditions
   Rule: Document one deterministic URL path plus visibility prerequisites whenever a feature is behind settings or permissions.

5. Context: Railway deployments from local `railway.toml`
   Mistake: Start command drifted to a non-existent runtime path and caused repeated crash loops
   Rule: Keep `railway.toml` `startCommand` aligned with Docker runtime entrypoint and verify with deployment logs after every command change.

6. Context: Quality review requests with explicit target scores
   Mistake: Initial assessment did not immediately convert score gaps into concrete code-level remediation tasks
   Rule: For any score target, map each category gap to a named patch + test gate before returning a status update.

7. Context: AI routing hardening in deterministic tool orchestration
   Mistake: Considered model-structured output guards before validating actual failure surface
   Rule: When tool routing is deterministic, prioritize planner fallback correctness and executor policy gating before adding LLM classifier layers.

8. Context: Open-source submission strategy after publish constraints
   Mistake: Treated npm publication as the only completion path for contribution evidence
   Rule: When package publication is blocked, ship the tool in-repo and open upstream PRs in high-signal repositories to preserve external contribution progress.

9. Context: AI chat UX feedback on response readability
   Mistake: Diagnostic metadata remained inline with assistant answers, reducing answer clarity
   Rule: Keep primary assistant messages user-facing only and place diagnostics (confidence, citations, verification, observability) behind an explicit info-triggered popover.

10. Context: Memory feature validation after chat/session persistence rollout
   Mistake: Session-scoped memory shipped without an explicit user-scoped preference path for cross-session continuity.
   Rule: When memory requirements mention user preferences, implement and test both session memory and user-level memory keyed independently from session IDs.

11. Context: Large table-driven Jest test expansion for policy routing and arithmetic behavior
   Mistake: Mixed tuple/string/object datasets under a single typed `it.each` signature created preventable TypeScript compile failures.
   Rule: Keep each table shape typed independently (`it.each<[...tuple]>()` for positional rows and object generics only for object rows).

12. Context: Ambiguous user follow-up prompts in a finance assistant ("what can i do?")
   Mistake: Capability-style routing captured actionable follow-up intent and bypassed tool-backed recommendation generation.
   Rule: Treat ambiguous action follow-ups as recommendation intent when finance context exists, and lock this with deterministic service tests.

13. Context: Recommendation replies looked short and repetitive even when tool context was available
   Mistake: Reliability gating accepted generic recommendation prose that lacked option sections and actionable structure.
   Rule: For recommendation-intent prompts, enforce sectioned output quality gates (Option 1/2 + assumptions/risk notes/next questions) and fall back to deterministic option plans when structure is missing.

14. Context: Casual greeting prompts in AI chat ("hey there")
   Mistake: Greeting variants that were not explicitly matched fell through to capability-list fallback text, which reduced conversational quality.
   Rule: Expand greeting pattern coverage (`hi/hello/hey` + `there`) and lock friendly greeting-first responses with deterministic routing and service tests.

15. Context: Real-user typo input for fundamentals analysis ("wfundamentals on tesla stock?")
   Mistake: Strict word-boundary intent matching missed fused typo prefixes, so planner skipped fundamentals tools and returned shallow fallback text.
   Rule: Pair regex intent checks with stable substring fragments for critical finance intents and lock typo examples in planner/helper/service regression tests.

16. Context: Angular standalone component icon migration to Lucide
   Mistake: `ModuleWithProviders` variants (`LucideAngularModule.pick(...)`) were treated as standalone component imports and blocked client builds.
   Rule: In standalone component metadata, import plain modules/components only; use direct icon data bindings (`[img]`) for Lucide instead of `.pick(...)`.

17. Context: Analysis-page embedded AI panel perceived as stale after successful responses
   Mistake: Chat success updated only local message state and did not trigger parent analysis data refresh.
   Rule: Emit a chat-success event from embedded AI panels and let parent containers refresh dependent UI state explicitly.

18. Context: Short conversational follow-ups ("why?", "what about that?") after a tool-backed answer
   Mistake: Follow-up turns with no explicit tool keywords fell back to generic capability text instead of preserving session context.
   Rule: Detect short follow-up prompts and, when prior turn tools exist, reuse prior successful tools from session memory before policy gating.

19. Context: Multi-file refactors using patch workflows
   Mistake: Patch operations were routed through shell commands instead of the dedicated patch tool.
   Rule: For every file edit, use the dedicated patch tool directly and keep shell commands read-only.

20. Context: Ticker-specific investment questions ("should I invest in NVIDIA?")
   Mistake: Investment keyword routing defaulted to portfolio concentration tools even when the query intent was external market research.
   Rule: For ticker-targeted advice/research intents, prioritize market context tools (quote, fundamentals, news, history) and only add portfolio tools when the query explicitly references portfolio/account context.
