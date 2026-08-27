# Constants

Values that steer behaviour live in `constants/`, not inline in the component or provider
that happens to use them first.

## The test

A value belongs in `constants/` when either is true:

1. **It is used by more than one file.** Two definitions of one value is two places to
   fix and one silent divergence waiting to happen.
2. **It is policy, not layout detail.** Thresholds, intervals, timeouts, ratios, retry
   counts, storage keys, feature limits: anything a reviewer might want to tune without
   reading the surrounding code.

Everything else may stay next to the code that uses it, but it still gets a name. A bare
`0.85` in a style block is unreadable whether it lives in `constants/` or not.

## Why this rule exists

`PROGRESS_REPORT_INTERVAL` was defined twice, as `10000` in
`app/(auth)/player/direct-player.tsx` and as `10_000` in
`providers/NativePlayerProvider.tsx`. Same policy, two owners. Changing the reporting
cadence meant knowing both existed, and nothing would have failed if only one had moved.

## Where each kind goes

| File | Holds |
| --- | --- |
| `constants/Values.ts` | Cross cutting app values with no better home (tab height, carousel height, sheet ratio) |
| `constants/Colors.ts` | Colour tokens |
| `constants/MediaTypes.ts` | Media type unions |
| `constants/TVSizes.ts` | TV poster sizes, gaps, padding, animation timings |
| `constants/TVTypography.ts` | TV type scale and the `useScaledTVTypography` hook |
| `constants/TVPosterSizes.ts` | TV poster size keys |

Add a new domain file when a group grows its own identity (playback, downloads,
networking). Do not let `Values.ts` become the place where everything lands.

## Rules

- Import through the alias: `import { TAB_HEIGHT } from "@/constants/Values"`.
- `SCREAMING_SNAKE_CASE` for scalars, `PascalCase` for grouped objects, matching what is
  already there.
- Give the constant a comment when the number encodes a decision. `SHEET_MAX_HEIGHT_RATIO`
  explains why the sheet stops at 0.85, and that sentence is worth more than the value.
- A value used by two modules never has two definitions. If you find one, collapse it as
  part of the change you are already making.
- Platform branches are fine inside a constant (`TAB_HEIGHT` does it) as long as callers
  stay unaware.

## When you touch a file that still has magic literals

Move them as part of that change. This is how the codebase converges without a dedicated
cleanup that nobody schedules.
