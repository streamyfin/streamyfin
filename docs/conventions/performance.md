# Performance Tests

A performance claim needs numbers, measured before and after the change. [Reassure](https://oss.callstack.com/reassure/) measures them in Jest: how many React commits an interaction causes, and how long rendering takes.

It only sees React work, not native code, so image decoding, the frame rate and memory are outside what it measures. But it gives us a good idea if a change is going to affect rendering performance, for good or bad, so we can take action if necessary.

## Running it

```bash
bun run perf:baseline   # measure a baseline
bun run perf            # measure the current code, and compare it to the baseline
```

To compare your branch against `develop`:

1. Commit or stash your changes, then switch to `develop` and run `bun i`.
2. Run `bun run perf:baseline`.
3. Switch back to your branch, run `bun i` again if `bun.lock` changed, then run `bun run perf`.

The comparison is written to `.reassure/output.md`. The `.reassure/` folder is gitignored, so the baseline survives switching branches.

CI does the same thing on every PR into `develop` that touches code the scenarios can reach (the `paths` filter in `perf.yml`), and posts the result as a comment on the PR (`perf.yml`, `perf-comment.yml`). The comment is a report, not a gate: a regression won't fail the build. If your PR shows one, look into it, and either fix it or explain in the PR why it's expected.

## Where the files go

- Performance test scenario files are named `*.perf-test.tsx` and are colocated with the code they measure.
- Name a scenario `.perf-test.tsx`, never `.perf.test.tsx`. Jest's default match skips `.perf-test.tsx`, so `bun run test:unit` never runs them. It would pick up `.perf.test.tsx` and run it as a unit test without the perf setup.
- A screen under `app/` can't have its scenario next to it, because Expo Router turns every file there into a route. Put it next to the logic the screen uses instead, the same as unit tests (see [testing.md](testing.md)).
- Both perf scripts run Jest with `jest.perf.config.js`, which is the unit config plus `test-utils/perfSetup.ts`.

## What the shared setup does

`test-utils/perfSetup.ts` runs before every scenario, so you don't have to set these up yourself:

- Fake timers, with `performance` left real. React reads its render durations from `performance.now`, so faking it would make every duration zero.
- Stubs for native modules and libraries that don't run in Jest: FlashList's measurements, MMKV, Reanimated, gesture handler, track player, safe area insets, the bottom sheet, sliders, gradients, glass effects, haptics, brightness, volume, toasts, i18n and the app's own native modules (`@/modules`).
- Stubs for things that lead to another screen: `ServerImage`, the router (`test-utils/expoRouter.ts`), `useAppRouter` and the item action sheet.
- A `JellyfinProvider` whose `apiAtom` holds a `makeApi()` double from `test-utils/jellyfinApi.ts`, so you can answer API requests with `api.mock`.

Everything else is up to the scenario. App providers and hooks, like settings, downloads, network status or the player contexts, are mocked in the scenario that needs them, not here. That way each scenario shows what it replaced. If you need the real version of one of the modules above, `jest.unmock` it in your scenario. If you need different route params, spread `expoRouterModule` and override `useLocalSearchParams`, like `components/library/LibraryPage.perf-test.tsx` does.

## Writing a scenario

`components/cards/CardRow.perf-test.tsx` is the simplest one to copy:

```tsx
import { fireEvent, screen } from "@testing-library/react-native";
import { measureRenders } from "reassure";

test("a CardRow re-renders when its parent updates", async () => {
  await measureRenders(<ParentWithCardRow />, {
    scenario: async () => {
      await screen.findByText("Latest Movies");
      await fireEvent.press(screen.getByTestId("re-render-button"));
    },
  });
});
```

`measureRenders` renders the component, runs the `scenario`, and records every commit in between. Some things to keep in mind:

- Keep everything real that re-renders on the interaction you're measuring: the screen, its components, Jotai and React Query. Only stub what reaches native code or another screen.
- Use `makeItems()` from `test-utils/baseItems.ts` to build the items a scenario renders.
- Use `reachListEnd()` from `test-utils/lists.ts` to load the next page of a list. Jest has no layout, so a list never scrolls to its end by itself.
- `fireEvent` is async. Always `await` it, or React warns about overlapping `act()` calls.
- Give each run a fresh `QueryClient` so every run starts from the same cold cache. `components/home/Home.perf-test.tsx` shows how.
- Fire events where the user would: on the pressable itself, not on a label drawn next to it.
- Reassure runs each scenario 11 times (1 warmup and 10 measured), so a scenario that does a lot of work needs its own Jest timeout.
- Below a few milliseconds, timer noise looks like a real change. Repeat the work inside one scenario until it takes longer than that.

## What the numbers mean

Each time React updates the screen, it does a "commit". Reassure reports three numbers for each scenario:

- **Count** is how many commits happened during the scenario. It only counts commits inside the component you passed to `measureRenders`.
  - The count is the same every time you run the test. So if the count changes, your code changed something.
  - The count is not the number of components that rendered. One commit can update one card or the whole screen. Both count as 1.
- **Duration** is how long React spent rendering, in milliseconds, across all of those commits.
  - If your change makes fewer components render, the duration goes down, even when the count stays the same.
  - The duration is a little different every time you run the test, usually by a few percent. A change that small is not a real change.
- **Stability** shows how much the duration changed between the 10 runs. A lower number is better. A high number means the result is less reliable.

## Reading the report

The report sorts each scenario into a group:

- **Significant changes:** the duration moved by at least 5% and the difference is consistent across runs, so it's probably real.
- **Meaningless changes:** the difference is within the noise.
- **Render count changes:** the count went up or down. Look at these, since the count is exact.
- **Added** or **Removed** scenarios: a scenario is new, or it was deleted. Renaming a test shows up as one removed and one added.

It also lists **render issues** with a 🔴. These don't mean the test failed:

- **Initial updates:** extra renders that happened while the component was mounting, such as an effect that sets state right away.
- **Redundant updates:** commits that rendered exactly the same output as the one before. These are work React did for nothing, and they're usually the first thing to look at when you want fewer re-renders.
