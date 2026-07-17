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

1. Read the Learned Facts Index section in `CLAUDE.md` and scan existing files in `.claude/learned-facts/` to understand what's already recorded
2. Review this conversation for learnings worth preserving
3. For each new fact:
   - Create a new file in `.claude/learned-facts/[kebab-case-name].md` using the template below
   - Append a new entry to the appropriate category in the **Learned Facts Index** section of `CLAUDE.md`
4. Skip facts that duplicate existing entries
5. If a new category is needed, add it to the index in `CLAUDE.md`

## Fact File Template

Create each file at `.claude/learned-facts/[kebab-case-name].md`:

```markdown
# [Title]

**Date**: YYYY-MM-DD
**Category**: navigation | tv | native-modules | state-management | ui
**Key files**: `relevant/paths.ts`

## Detail

[Full description of the fact, including context for why it matters]
```

## Index Entry Format

Append to the appropriate category in the Learned Facts Index section of `CLAUDE.md`:

```
- `kebab-case-name` | Brief one-line summary of the fact
```

Categories: Navigation, UI/Headers, State/Data, Native Modules, TV Platform

## Example

File `.claude/learned-facts/state-management-pattern.md`:
```markdown
# State Management Pattern

**Date**: 2025-01-09
**Category**: state-management
**Key files**: `utils/atoms/`

## Detail

Use Jotai atoms for global state, NOT React Context. Atoms are defined in `utils/atoms/`.
```

Index entry in `CLAUDE.md`:
```
State/Data:
- `state-management-pattern` | Use Jotai atoms for global state, not React Context
```

After updating, summarize what facts you added (or note if nothing new was learned this session).
