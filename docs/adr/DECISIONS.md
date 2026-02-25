# Decisions

**Purpose**: Quick-scan table of project decisions. For detailed architecture rationale, see `docs/adr/`.

Last updated: 2026-02-24

| ID | Date | What we decided | Alternatives considered | Why we chose this | What would change our mind | Discussion / Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| D-001 | 2026-02-23 | Domain focus: Finance agent on Ghostfolio | Healthcare agent on OpenEMR | Faster delivery path, existing finance services, clear verification surface | Repo constraints shift, delivery risk profile shifts, domain requirements shift | `docs/requirements.md`, `docs/PRESEARCH.md` |
| D-002 | 2026-02-23 | Agent framework: LangChain | LangGraph, CrewAI, AutoGen, custom | Fast path to tool orchestration, tracing integration, eval support | Workflow complexity grows and state-machine orchestration brings better latency and reliability | `docs/PRESEARCH.md` |
| D-003 | 2026-02-23 | Observability and eval platform: LangSmith | Braintrust, Langfuse, custom telemetry | Integrated traces, datasets, eval loops, quick setup | Cost and trace volume profile shifts, platform limits appear | `docs/requirements.md`, `docs/PRESEARCH.md` |
| D-004 | 2026-02-23 | Delivery workflow: ADR plus RGR | Ad hoc implementation workflow | Better auditability, tighter change control, faster regression detection | Delivery cadence drops or verification burden grows beyond value | `docs/PRESEARCH.md`, `docs/adr/README.md` |
| D-005 | 2026-02-24 | Open source strategy: Multi-platform eval framework release | Single contribution point (LangChain PR only) | Maximize visibility and impact: npm package + LangChain integration + benchmark leaderboards + academic DOI | LangChain contribution accepted early and becomes primary distribution channel | `thoughts/shared/plans/open-source-eval-framework.md`, `docs/requirements.md` |
| D-006 | 2026-02-25 | Deployment topology: embedded AI for v1 | Sidecar-first architecture | Fastest delivery, lowest integration risk, and immediate observability path in Ghostfolio API | Sidecar-worthy latency, durable workflows, or hard isolation policy emerge | `docs/adr/ADR-001-deployment-topology.md` |
| D-007 | 2026-02-25 | Integration seam: AgentKernel + ToolRegistry | Direct inline execution only | Future sidecar migration should remain a transport switch, not a rewrite | Tool model grows beyond current utility and interface becomes the control plane bottleneck | `docs/adr/ADR-002-integration-seam.md` |
| D-008 | 2026-02-25 | AI UI surface: existing chat path + upgraded AI panels | New page or floating widget first | Fast measurable eval loop and lower UI friction using existing auth + feedback hooks | Product requirements demand single global AI entry and persistent ambient access | `docs/adr/ADR-003-ui-surface.md` |
| D-009 | 2026-02-25 | Auth + tenancy: hard scoped identity | Soft fallback when identity is missing | Tenant safety and auditability remain mandatory in regulated workflows | External anonymous workflow product requirement appears | `docs/adr/ADR-004-auth-tenancy.md` |
| D-010 | 2026-02-25 | Tool policy: allowlists, per-tool caps, deterministic fallback | No explicit caps with timeout fallback only | Limits cost, complexity, and unbounded tool execution | Tool surface stabilizes and policy governance overhead is too high for value | `docs/adr/ADR-005-tool-execution-policy.md` |
| D-011 | 2026-02-25 | Tracing + correlation: single trace ID | Subsystem-local trace IDs | Reliable request-to-verification auditability and faster incident response | Correlation requirements shift to a unified observability platform with stronger native joins | `docs/adr/ADR-006-tracing-correlation.md` |

Architecture-level decision records live in `docs/adr/`.
