---
description: Reflect on this session to extract and store learned facts about the codebase
---

Analyze the current conversation to extract useful facts that should be remembered for future sessions. Focus on:

1. **Corrections**: Things the user corrected you about
2. **Clarifications**: Misunderstandings about how the codebase works
3. **Patterns**: Important conventions or patterns you learned
4. **Gotchas**: Surprising behaviors or edge cases discovered
5. **Locations**: Files or code that was hard to find

## Instructions

1. Read the existing facts file at `.claude/learned-facts.md`
2. Review this conversation for learnings worth preserving
3. For each new fact:
   - Write it concisely (1-2 sentences max)
   - Include context for why it matters
   - Add today's date
4. Skip facts that duplicate existing entries
5. Append new facts to `.claude/learned-facts.md`

## Fact Format

Use this format for each fact:
```
- **[Brief Topic]**: [Concise description of the fact] _(YYYY-MM-DD)_
```

## Example Facts

- **State management**: Use Jotai atoms for global state, NOT React Context - atoms are in `utils/atoms/` _(2025-01-09)_
- **Package manager**: Always use `bun`, never npm or yarn - the project is configured for bun only _(2025-01-09)_
- **TV platform**: Check `Platform.isTV` for TV-specific code paths, not just OS checks _(2025-01-09)_

After updating the file, summarize what facts you added (or note if nothing new was learned this session).
