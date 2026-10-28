# Performance Tests

A performance claim needs numbers, measured before and after the change. [Reassure](https://oss.callstack.com/reassure/) measures them in Jest: how many React commits an interaction causes, and how long rendering takes.

It only sees React work, not native code, so image decoding, the frame rate and memory are outside what it measures. But it gives us a good idea if a change is going to affect rendering performance, for good or bad, so we can take action if necessary.

## Running it

```bash
bun run perf:baseline   # measure a baseline
bun run perf            # measure the current code, and compare it to the baseline
```

To compare your branch against the branch its PR targets, commit your changes and run:

```bash
bun run perf:baseline:branch              # the open PR's target, else upstream/develop; then switches back
bun run perf:baseline:branch <base-ref>   # a base of your choosing, for example a PR stacked on another branch
bun run perf
```

The target comes from `gh pr view`, the same fact CI uses. Without a PR it falls back to `develop`, looked up on `upstream` before `origin`. A branch stacked on another one should name its parent, so the parent's gains don't count as yours. The script prints the base it chose.

The baseline is measured with the scenario files and `test-utils/` doubles your branch added or changed copied onto the base, so a new scenario has a baseline in the same PR that adds it, and a changed one is compared as the same test. A scenario that needs code only your branch has can't run on the base; it is reported and left without a baseline.

The comparison is written to `.reassure/output.md`. The `.reassure/` folder is gitignored.

CI does the same on every PR that touches code the scenarios can reach (the `paths` filter in `perf.yml`), measuring the PR's own base branch as the baseline, so a PR stacked on another one is compared against that one rather than `develop`. It posts the result as a comment on the PR (`perf.yml`, `perf-comment.yml`). The comment is a report, not a gate: a regression won't fail the build. The comment is not Reassure's own report: `scripts/reassure-report.ts` rebuilds it from `.reassure/output.json`, because Reassure puts a 🔴 on any 5% change however small in milliseconds, and on every render issue. In the comment a 🔴 means a duration regression of at least 1 ms and 10%, or a render count that went up. Render issues and smaller changes are left out; the full Reassure report is in the job summary and in `.reassure/output.md` locally. If your PR shows one, look into it, and either fix it or explain in the PR why it's expected.

## Where the files go

- Performance test scenario files are named `*.perf-test.tsx` and are colocated with the code they measure.
- Name a scenario `.perf-test.tsx`, never `.perf.test.tsx`. Jest's default match skips `.perf-test.tsx`, so `bun run test:unit` never runs them. It would pick up `.perf.test.tsx` and run it as a unit test without the perf setup.
- A screen under `app/` can't have its scenario next to it, because Expo Router turns every file there into a route. Put it next to the logic the screen uses instead, the same as unit tests (see [testing.md](testing.md)).
- Both perf scripts run Jest with `jest.perf.config.js`, which is the unit config plus `test-utils/perfSetup.ts`.

## What the shared setup does

`test-utils/perfSetup.ts` runs before every scenario, so you don't have to set these up yourself:

- The app's real i18n, so translated strings cost what they cost in the app.
- Fake timers, with `performance` left real. React reads its render durations from `performance.now`, so faking it would make every duration zero.
- Stubs for native modules and libraries that don't run in Jest: FlashList's measurements, MMKV, Reanimated, safe area insets, the bottom sheet, device info, toasts and the app's own native modules (`@/modules`).
- A recording router: `test-utils/expoRouter.ts` stands for `expo-router`, and its `router` holds the `push` and `replace` calls the real `useAppRouter` makes, so a scenario can assert them.
- `@/utils/atoms/api` and a `JellyfinProvider` that re-exports it, whose `apiAtom` holds a `makeApi()` double from `test-utils/jellyfinApi.ts`, so you can answer API requests with `api.mock`.

The app's own components render for real: `ServerImage`, `GlassSurface`, `TouchableItemRouter`, `useAppRouter`, haptics and the item action sheet. Stubbing them would leave their cost out of every number. Only what reaches native code is stubbed.

Everything else is up to the scenario. Native modules only one feature uses, like the track player, volume, key events, the slider and gesture handler, have a double in `test-utils/` that the scenario wires with `jest.mock`, as `components/music/MusicTrackItem.perf-test.tsx` does. App providers and hooks, like settings, downloads, network status or the player contexts, are mocked in the scenario that needs them, not here. That way each scenario shows what it replaced. If you need the real version of one of the modules above, `jest.unmock` it in your scenario. If you need different route params, spread `expoRouterModule` and override `useLocalSearchParams`, like `components/library/LibraryPage.perf-test.tsx` does.

## Writing a scenario

`components/settings/AppearanceSettings.perf-test.tsx` is the simplest one to copy:

```tsx
import { fireEvent, screen } from "@testing-library/react-native";
import { measureRenders } from "reassure";
import AppearancePage from "@/app/(auth)/(tabs)/(home)/settings/appearance/page";

test("toggling a setting re-renders the appearance page", async () => {
  await measureRenders(<AppearancePage />, {
    scenario: async () => {
      const switches = await screen.findAllByRole("switch");
      for (const toggle of switches) {
        await fireEvent(toggle, "valueChange", true);
      }
    },
  });
});
```

`measureRenders` renders the component, runs the `scenario`, and records every commit in between. Some things to keep in mind:

- Keep everything real that re-renders on the interaction you're measuring: the screen, its components, Jotai and React Query. Only stub what reaches native code or another screen.
- For a component that only needs to survive its parent re-rendering, `measureParentRerenders(() => <Component />)` from `test-utils/rerender.tsx` is the whole scenario. Table it over props or components, as `components/cards/Cards.perf-test.tsx` and `components/tv/TVCards.perf-test.tsx` do.
- Use `makeItems()` from `test-utils/baseItems.ts` to build the items a scenario renders.
- Use `reachListEnd()` from `test-utils/lists.ts` to load the next page of a list. Jest has no layout, so a list never scrolls to its end by itself.
- Use `pullToRefresh()` from the same file to pull a list down. Jest has no touches, so nothing else triggers its `onRefresh`.
- `fireEvent` is async. Always `await` it, or React warns about overlapping `act()` calls.
- Give each run a fresh `QueryClient` so every run starts from the same cold cache. `QueryWrapper` and `usePerfQueryClient` in `test-utils/queryWrapper.tsx` do that. If a scenario also needs Jotai, use `JotaiQueryWrapper` from the same file.
- A scenario that sets atoms needs a fresh Jotai store on every mount too. `beforeEach` runs once per test, not once per run, so atoms set on the default store keep the last run's values into the next one. Create the store in the wrapper's `useState`, set its starting values there, and set atoms through that store, as `components/downloads/ActiveDownloads.perf-test.tsx` does.
- Fire events where the user would: on the pressable itself, not on a label drawn next to it.
- Reassure runs each scenario 11 times (1 warmup and 10 measured), so `jest.perf.config.js` raises the Jest timeout to 60 seconds.
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
