# Testing

Every behaviour change comes with a test that would have caught the bug. The runner is
Jest with the `jest-expo` preset, so a test can import anything the app imports, native
modules included.

```bash
bun run test:unit             # the whole suite
bunx jest utils/chapters      # one file or a path fragment
bunx jest -t "resume point"   # one test by name
bun run test:coverage         # the suite plus a coverage report in coverage/
```

## What must have a test

- **A bug fix.** Write the failing test first, from the reported behaviour. A fix whose
  test passes before the fix is a fix for something else.
- **A pure function or a utility.** Anything under `utils/` that takes values and returns
  values has no excuse: it is the cheapest test in the codebase.
- **A policy.** Resolution order, precedence, thresholds, anything with the shape "when A
  and B, prefer C". Those are the rules that get silently inverted by a later refactor.
- **A component or hook whose logic is not obvious.** Render it with React Native Testing
  Library and assert on what the user sees, not on internal state.

Do not chase a coverage number. A test that asserts an implementation detail costs more
than it protects: it fails on every refactor without ever catching a bug.

## Where tests live

Next to the code, as `<name>.test.ts`, or `<name>.test.tsx` when the test
contains JSX. `utils/chapters.ts` is covered by `utils/chapters.test.ts`.
Shared fixtures and doubles go in `test-utils/`.

The one exception is a screen under `app/`. Expo Router turns every `.ts` and `.tsx`
file there into a route, a spec included, so the spec lives with the logic the screen
uses and the screen carries a comment pointing at it:
`app/(auth)/player/direct-player.tsx` is covered by
`utils/directPlayer/directPlayerPage.test.tsx`.

## Writing a test

Name the test after the behaviour, not the function: "keeps the resume point when the
native player reports 0" reads better in a failure report than "teardownSession works".

Cover the edges that actually occur: the zero value, the missing value, the value that
arrives late, the second call. Most bugs in this codebase have lived in one of those.

Comment the *why* when a case is not obvious. A test that pins a past regression should
say which one, so the next person does not delete it as redundant.

## Mocks

`jest-expo` already mocks the native Expo surface, so most specs need no module mock at
all. When you do need one:

```typescript
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
}));
```

Three rules keep mocks from becoming the thing that breaks:

- `jest.mock` is hoisted above the imports, so its factory cannot reference an
  out-of-scope variable. Give the variable a `mock` prefix (`mockStore`), or read the real
  module inside the factory with `jest.requireActual`.
- Jest gives every test file its own module registry, so a mock never leaks into another
  spec. Stub only what the module under test touches, and do not try to keep stubs
  compatible across files.
- Prefer a real implementation to a stub whenever it is pure. `jest.requireActual` on a
  helper is more faithful than a hand written double that drifts from it.

### Shared doubles

`test-utils/` holds the doubles several specs need:

- `stubReactNative()` patches `Platform` and `AppState` on the real module. A module that
  reads `Platform` when it loads has to be required after the call, not imported, or it
  keeps the platform it saw first.
- `mmkvModule` stands for `react-native-mmkv`, backed by one map per spec file;
  `clearMmkv()` empties it between tests. `moduleNameMapper` wires it for every
  spec through `test-utils/mmkvModule.ts`, so it needs no `jest.mock` of its own.
- `react-i18next` is wired for every spec: `useTranslation` returns a `t` that returns its
  key, and the rest of the package is real. A spec asserting on interpolation, a language
  or the calls `t` receives mocks it with `@/test-utils/realI18next` or its own factory.
- `silentLogModule` stands for `@/utils/log` when a spec only needs the log
  silenced. A spec that records or asserts on log calls keeps its own factory.
- `secureStoreModule` stands for `expo-secure-store`, the same way; `clearSecureStore()`
  empties it, and `secureStoreValues` seeds or reads it back. `lockSecureStore()` locks the
  phone: a read then throws, as the Keychain's does, unless the item was created as readable
  after the first unlock.
- `fileSystemModule` stands for `expo-file-system` in specs that delete or download files: a
  path exists once `fakeFiles.add()` puts it there, or a download lands on it, and until
  something deletes it. `fakeFiles.clear()` empties the disk, `fakeFiles.remaining()`,
  `fakeFiles.deleted()` and `fakeFiles.downloads()` read it back.
- `react-native-safe-area-context` is wired for every spec: `useSafeAreaInsets` reports
  no insets, the rest is real. `silentHapticModule` stands for `@/hooks/useHaptic` when a
  haptic should be a no-op.
- `stubModules` holds one-line stand-ins repeated across specs: `bitrateSelectorModule`,
  `appRouterModule`, `inactivityModule`, `expoWithoutNativeModule`, `onlineModule`,
  `emptyTVTypographyModule` and `blankIconsModule`.
- `makeJellyfinAtomsModule(api, user)` stands for `@/providers/JellyfinProvider` when a
  spec only reads the api and user atoms. `makeSettingsModule()` stands for
  `@/utils/atoms/settings` with the default settings plus overrides.
- `customHeadersModule()` stands for the `@/utils/customHeaders` barrel, with the pure
  helpers for real and the native side stubbed; `setJellyfinHeaders()` sets what it reports.
- `reanimatedModule` stands for `react-native-reanimated` when a spec renders a component
  that holds shared values. Reanimated's own Jest mock returns a new shared value on
  every render, which re-runs any effect that depends on one.
- `tsxRequireHook` stands for `tsx/cjs` in every spec, wired once through
  `moduleNameMapper` instead of per spec. A require hook registered from a spec lands on
  the Jest worker's own loader and breaks whichever spec that worker loads next.

A double a spec opts into is wired the same way everywhere:

```typescript
jest.mock(
  "react-i18next",
  () => jest.requireActual("@/test-utils/i18next").identityTranslationModule,
);
```

Packages are wired for every spec through `moduleNameMapper`: `react-native-mmkv`,
`react-i18next`, `react-native-safe-area-context`, `@gorhom/bottom-sheet` and
`react-native-device-info`. The bottom sheet and device info use the libraries' own Jest
mocks. A mapper entry matches the import specifier only, so it cannot stand for an app
module that is also imported relatively.

App modules are mocked by path in `test-utils/unitSetup.ts`: `@/utils/atoms/settings`
(`makeSettingsModule()`), `@/components/common/ServerImage` (a `View` named after its
URL) and `@/hooks/useNetworkStatus`. A spec that needs other values declares its own
`jest.mock`, e.g. `makeSettingsModule({ ... })`; a spec about the real module calls
`jest.unmock`.

The perf config (`jest.perf.config.js`) inherits the package mappings except `expo-router`
and `react-i18next`, and replaces the unit setup file with `test-utils/perfSetup.ts`: a
scenario measures the real translation, settings, image and network cost.

## React Native components

React Native Testing Library renders components into a real tree:

```typescript
import { render, screen, fireEvent } from "@testing-library/react-native";

test("shows the retry button after a failed load", () => {
  render(<ItemPage item={brokenItem} />);
  fireEvent.press(screen.getByText("Retry"));
  expect(screen.getByTestId("spinner")).toBeTruthy();
});
```

Query by what the user perceives (text, accessibility label, role) before reaching for a
`testID`. A test that finds a button by its label keeps working when the tree moves.

## Before you push

`bun run test:unit` has to be green, and so does the file you touched when it runs alone.
A test that passes on its own but fails in the suite is a test that shares state with its
neighbours, and it will fail in CI on someone else's PR rather than on yours.
