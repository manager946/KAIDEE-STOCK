# AGENTS.md — KAIDEE-STOCK

## METANG Development Governance V1.0 — Agent Workflow

- Follow this repository's existing safety, scope, privacy, branch and release controls. If this section conflicts, the more restrictive existing rule wins; stop and report ambiguity.
- ChatGPT is Architect/Reviewer; Codex and Claude Code are scoped implementers; an independent reviewer examines actual diffs/tests when possible. Do not claim access or successful tests without evidence.
- Choose **one primary available Superpowers skill** per task. New feature/behavior: `/superpowers:brainstorming`; approved spec to plan: `/superpowers:writing-plans`; approved plan to implementation: `/superpowers:executing-plans`; owner-directed subagents: `/superpowers:subagent-driven-development`; bug/root cause: `/superpowers:systematic-debugging`; test-first code: `/superpowers:test-driven-development`.
- Completion evidence: `/superpowers:verification-before-completion`; request review: `/superpowers:requesting-code-review`; respond to review: `/superpowers:receiving-code-review`; isolate worktree: `/superpowers:using-git-worktrees`; close branch: `/superpowers:finishing-a-development-branch`; truly independent tasks: `/superpowers:dispatching-parallel-agents`.
- A **strict read-only Gate** uses a direct audit prompt, without invoking a design skill. If the named skill is not installed in the executing agent, disclose that fact and do not pretend to invoke it.
- For each task state repository/ref/HEAD, goal, permitted files, prohibited actions, acceptance tests, actual evidence and stop gate. One skill in the first line only where applicable; no placeholders or silent scope expansion.
- Approvals are independent for design, plan, implementation, local commit, push, Draft PR, merge, and deployment/`clasp push`. One approval never authorizes another. No force push, PR retarget, rebase of another agent's branch, or Production modification without specific approval.
- Before requesting a code commit provide `git status`, `git diff --stat`, `git diff --check`, the focused source diff, actual test commands/results, data/PII/side-effect review, remaining risks, and rollback. Classify evidence as reproduced, agent-reported, or blocked.
- Never place customer names, phone numbers, addresses, confidential data, tokens or secrets in code fixtures, GitHub diffs, reports, `console.error` or logs. Use synthetic data. Passing tests do not imply deployment or fabrication approval.
- Governance Markdown is not a technical security control: retain server-side authorization, GitHub rulesets, environment isolation and approval gates.

## Project-specific non-negotiables
- Stock/Orders/shipments/returns must preserve exactly-once and rollback/audit invariants.
- Treat STAGING/Disposable Sheets as separate from original Production Sheets. Owner requirements (project context, not confirmed by this repository's source code): do not edit master stock, original H8:H59 or PDF ACL, and never make customer PDFs public.
- Preserve existing working branch/PR data; read latest active branch documentation before changing source. Run repository `npm test` plus any job-specific QA. No staging/Production writes by default.
