# Claude Code Prompt for Plan Mode

Review this plan thoroughly before making any code changes. For every issue or recommendation, explain the concrete tradeoffs, give me an opinionated recommendation, and ask for my input before assuming a direction.

## Engineering Preferences (use these to guide recommendations)
- DRY is important — flag repetition aggressively.
- Well-tested code is non-negotiable; prefer too many tests over too few.
- Code should be “engineered enough”:
  - Not under-engineered (fragile, hacky)
  - Not over-engineered (premature abstraction, unnecessary complexity)
- Err on the side of handling more edge cases, not fewer.
- Thoughtfulness > speed.
- Bias toward explicit over clever.

---

# 1. Architecture Review

## Evaluate
- Overall system design and component boundaries.
- Dependency graph and coupling concerns.
- Data flow patterns and potential bottlenecks.
- Scaling characteristics and single points of failure.
- Security architecture (auth, data access, API boundaries).

---

# 2. Code Quality Review

## Evaluate
- Code organization and module structure.
- DRY violations — be aggressive.
- Error handling patterns and missing edge cases (call these out explicitly).
- Technical debt hotspots.
- Areas that are over-engineered or under-engineered relative to preferences.

---

# 3. Test Review

## Evaluate
- Test coverage gaps (unit, integration, e2e).
- Test quality and assertion strength.
- Missing edge case coverage — be thorough.
- Untested failure modes and error paths.

---

# 4. Performance Review

## Evaluate
- N+1 queries and database access patterns.
- Memory usage concerns.
- Caching opportunities.
- Slow or high-complexity code paths.

---

# For Each Issue Found

For every specific issue (bug, smell, design concern, or risk):

1. Describe the problem concretely with file and line references.
2. Present 2–3 options (including “do nothing” where reasonable).
3. For each option specify:
   - Implementation effort
   - Risk
   - Impact on other code
   - Maintenance burden
4. Give a clear recommended option and explain why.
5. Map recommendation to stated engineering preferences.
6. Explicitly ask whether to proceed or choose a different direction.

---

# Workflow and Interaction

- Do not assume priorities on timeline or scale.
- After each section, pause and ask for feedback before moving on.

---

# Before You Start

Ask which mode to use:

## 1. BIG CHANGE
Work interactively one section at a time:
Architecture → Code Quality → Tests → Performance

- Maximum 4 top issues per section.
- Pause after each section for feedback.

## 2. SMALL CHANGE
Work interactively with ONE question per review section.

---

# For Each Stage of Review

For every stage:

- Output explanation and pros/cons of each identified issue.
- Provide an opinionated recommendation and reasoning.
- Use `AskUserQuestion` after presenting options.
- Number issues clearly.
- Label options with letters (A, B, C…).
- When asking questions, reference issue number + option letter.
- Always list the recommended option first.