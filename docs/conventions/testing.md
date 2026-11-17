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

Native code has its own two places. Kotlin is tested with JUnit under
`modules/<name>/android/src/test`. Swift that imports nothing but Foundation or
AVFoundation is tested by a standalone check: `tests/native/<Name>Tests.swift`, compiled
with the sources it covers by `scripts/ios/test-<name>.sh`, with no Xcode target and no
simulator. `scripts/ios/run-native-checks.sh` runs every check, and CI runs both kinds
when a module, a check or the receiver vectors change. The receiver protocol vectors in
`e2e/fixtures/receiver-protocol` are replayed by Jest, the bench, JUnit and the Swift
check alike: a new case goes there first, see its README.

## Writing a test

Name the test after the behaviour, not the function: "keeps the resume point when the
native player reports 0" reads better in a failure report than "teardownSession works".

Cover the edges that actually occur: the zero value, the missing value, the value that
arrives late, the second call. Most bugs in this codebase have lived in one of those.

Comment the *why* when a case is not obvious. A test that pins a past regression should
say which one, so the next person does not delete it as redundant.

## Mocks

**Mock the boundary and keep app logic real.** Native code, storage, and other I/O need
doubles in Jest. Settings, routing, and other app decisions are what the spec should
exercise. Mocking them by default can let broken app code pass.

Put shared boundary doubles in `test-utils/` and wire them once. A spec adds a mock only
when it needs a different answer for its scenario.

### Boundary or app logic

What a module does matters more than where it lives. `utils/log.tsx` is app code, but it
crosses a boundary.

A module is a **boundary** when both hold:

- Running it reaches something Jest cannot or should not run: native code, the file
  system, the network, the keychain, Sentry, or a long-lived timer.
- Its callers do not depend on its result. They call it for a side effect and carry on, so
  a spec of a caller asserts nothing about what it did.

A module is **app logic** when its callers' behaviour depends on what it returns or holds:
a setting changes what renders, the session decides which request is sent, the router
wrapper adds the offline parameter. A double of it would decide the result of the spec.

| Module | Class | Why |
| --- | --- | --- |
| `@/utils/log` | Boundary | Writes to Sentry and the MMKV log store; callers ignore the result |
| `@/hooks/useHaptic` | Boundary | Drives the haptic engine; nothing reads it back |
| `@/components/common/ServerImage` | Boundary | Decodes in native code |
| `@/utils/serverUrl/probes/jellyfin` | Boundary | A network request |
| `sonner-native` | Boundary | Draws a native toast; callers never read it back |
| `expo-notifications` | Boundary | Native OS notifications |
| `@/hooks/useTVBackPress` | Boundary | Subscribes to the TV remote's back and menu keys |
| `@sentry/react-native` | Boundary | Sends events and keeps a timer running past the last test |
| `@expo/react-native-action-sheet` | Boundary | Draws the native sheet; the user's choice is the only answer |
| `@shopify/flash-list` | Boundary | Measures natively; the library's own `jestSetup` stubs only that |
| `expo-blur`, `react-native-qrcode-svg` | Boundary | Drawn natively |
| `@expo/ui/swift-ui`, `@expo/ui/jetpack-compose` | Boundary | Native views; each double stands in as what it carries |
| `@/utils/device` | Boundary | Reads the native device name; the double gives a fixed id and name |
| `@/modules/wifi-ssid` | Boundary | Reads the Wi-Fi network natively |
| `@/utils/atoms/settings` | App logic | Callers branch on every setting |
| `@/providers/JellyfinProvider` | App logic | The session decides what each request carries |
| `@/hooks/useAppRouter` | App logic | Adds `offline=true` inside an offline context |
| `@/utils/customHeaders` | App logic | Decides which headers and URLs a request uses |

The mock count is a clue, not the rule. If most specs only silence a module, it may belong
in global setup. If they need different answers from it, keep the mock local.
`@/constants/TVTypography` is often silenced, but it reads settings, so it stays app logic.

`react-i18next` and `i18next` are a separate case: they return `undefined` before the app
initializes them, so both are wired. The `i18next` double reads through to the real
singleton: `t` returns its key until a spec calls `init`, then translates. The
`react-i18next` double always returns the key from `useTranslation`, booted or not, and
reports `i18n.language` as `en-US` (`SPEC_LANGUAGE` in `test-utils/i18next.ts`), so a date
or a number formatted with it comes out the same on every machine. A spec that needs real
translations from the hook mocks `react-i18next` with `@/test-utils/realI18next`
(`components/series/SeasonDropdown.test.tsx`). Packages that need app start-up
configuration belong in global setup too.

### The rules

1. **Check what is already wired before writing a mock.** `jest.config.js`
   (`moduleNameMapper`) maps packages to doubles in `test-utils/`. `test-utils/unitSetup.ts`
   mocks the boundary app modules. `jest-expo` mocks the native Expo modules. Most specs need
   no `jest.mock` at all.
2. **Wire every boundary double globally.** Put it in `test-utils/` and add it to the config
   or `unitSetup.ts`. Delete the per-spec copies it replaces.
3. **Never wire a double of app logic globally.** A spec that needs one adds one line that
   uses a shared double, so the reader sees what was replaced:

   ```typescript
   jest.mock("@/hooks/useAppRouter", () =>
     jest.requireActual("@/test-utils/stubModules").appRouterModule,
   );
   ```

   When a second spec needs the same app-logic double, move it to `test-utils/`, unwired.
4. **Unmock the module a spec is about.** A spec for `utils/log.tsx` or `hooks/useHaptic.ts`
   calls `jest.unmock("<path>")` with a short comment saying why. Otherwise it tests the
   double and passes for the wrong reason.
5. **A double behaves like the real module and exposes a handle.** Use the handle instead of
   rewriting the double: `jest.mocked(writeErrorLog)`, `jest.mocked(toast.error)`,
   `jest.mocked(Notifications.getPermissionsAsync)`, `jest.mocked(Sentry.captureException)`,
   `pressTVBack()`, `chooseAction(index)`, `jest.mocked(jellyfinProbe)`,
   `appRouter`, `clearMmkv()`, `clearSecureStore()`, `secureStoreValues`,
   `lockSecureStore()` (the keychain of a locked phone), `setJellyfinHeaders()`, and
   `fakeFiles` with `fakeFiles.remaining()`, `fakeFiles.deleted()` and
   `fakeFiles.downloads()`.
   If the real function is pure, use it.
6. **Do not depend on mock state left by another test.** `clearMocks` is on, so call counts
   reset before each test. Implementations set with `mockReturnValue` or
   `mockImplementation` are kept. Set them in the test or in `beforeEach`, or call
   `mockReset()` on one mock to start from an empty `jest.fn()`. Never call
   `jest.resetAllMocks()`: it strips the defaults of every wired double, so
   `readFromLog()` and `getPermissionsAsync()` start returning `undefined`.
7. **Restore spies and timers.** A `jest.spyOn` or fake timer stays active until it is
   undone. Call `mockRestore()` or `jest.useRealTimers()` in `afterEach`.
   **Leave no real timer running when a test ends.** A pending timer can keep the Jest
   worker alive past its 500 ms grace period and print "A worker process has failed to
   exit gracefully". The highest-risk cases:
   - A `QueryClient` without `gcTime: Number.POSITIVE_INFINITY` schedules a five-minute
     garbage collection timer for every query.
   - A hook that sets its own `retry` (`retryPluginRead`) overrides the client's
     `retry: false`. Give the client `retryDelay: 0`: `client.clear()` cancels a retry but
     not the timer it waits on.
   - Code under test that schedules its own delay, such as the card removal after a failed
     download, runs under `jest.useFakeTimers()` with `jest.clearAllTimers()` in `afterEach`.
8. **Assert on results, not on the double.** Check what the user sees or what crossed the
   boundary (a request sent, a route pushed, an error reported). A test that counts calls to
   an internal double breaks on every refactor.

### What is wired

- **Packages** are mapped in `jest.config.js` (`moduleNameMapper`) when their double is a
  whole module file (`test-utils/*Module.ts`), and mocked in `test-utils/unitSetup.ts` when
  it is a factory exported next to the handles specs import: `expo-secure-store`,
  `sonner-native`, `i18next`, `@sentry/react-native`, `@expo/react-native-action-sheet`,
  `expo-blur`, `react-native-qrcode-svg`, `expo-notifications`, `@expo/ui/swift-ui` and
  `@expo/ui/jetpack-compose`.
- **`@expo/ui/swift-ui`** is `test-utils/swiftUi.tsx`. Each `Menu` keeps the modifiers it
  was given, which `renderedMenuModifiers(screen)` reads back, and
  `@expo/ui/swift-ui/modifiers` stays real. `swiftUi.test.ts` fails when the app takes a
  view the double lacks.
- **`tsx/cjs`** maps to a stub, `test-utils/tsxRequireHook.ts`. The real module registers a
  require hook on the Jest worker's own loader, which outlives the spec and breaks the next
  specs in that worker (`.claude/learned-facts/require-hooks-leak-across-jest-specs.md`).
- **`requestIdleCallback`**, which React Native provides and Node lacks, comes from
  `test-utils/idleCallback.ts` through `setupFiles`, built on timers so fake timers drive it.
  `pendingIdleCallbacks()` counts the ones still waiting, which is how a spec proves an
  unmounted component cancelled its own.
- **Boundary app modules** are mocked by path in
  `test-utils/unitSetup.ts`. `moduleNameMapper` matches only the exact import string, so it
  cannot replace a module that other files import by a relative path.
- **Doubles of app logic** (`makeSettingsModule()`, `makeJellyfinAtomsModule()`,
  `appRouterModule`, `networkStatusModule`, `customHeadersModule()` and others) are in
  `test-utils/` but not wired. A spec adds one as described in rule 3.

### Doubles a spec adds itself

Most specs do not need these, so they are not wired. A spec that does adds one with
`jest.requireActual`:

```typescript
jest.mock(
  "react-native-reanimated",
  () => jest.requireActual("@/test-utils/reanimated").reanimatedModule,
);
```

- `reanimatedModule`: for a component that holds shared values. Reanimated's own Jest mock
  returns a new shared value on every render, which re-runs any effect that depends on it.
- `stubReactNative()`: patches `Platform` and `AppState` on the real module. A module that
  reads `Platform` when it loads must be required after the call, not imported.
- `requireOnPlatform({ isTV: true }, () => require("./Seerr"))`: loads a module on another
  platform inside `jest.isolateModules`, setting `Platform` on the isolated copy of
  react-native. Use it to compare one module across platforms in a single spec
  (`constants/Seerr.test.ts`, `utils/profiles/av1Support.test.ts`).
- Never mock all of `react-native` with a factory. Expo installs globals such as `fetch`
  lazily. Under `--runInBand`, later specs share the worker; a read from the stand-in
  after teardown can log an error and make Jest exit 1 even when every test passed. Use
  `stubReactNative()` or `requireOnPlatform()` instead.
- `stubModules` also exports `expoWithoutNativeModule`, `onlineModule` and
  `emptyTVTypographyModule`.
- `draxModule`: for `react-native-drax`, since a real drag needs gestures and layout Jest
  does not have. Rows render from drax's own copy, which a drop the parent accepts leaves
  in the old order (`shownItems()` reads the order drax shows), each sortable item keeps
  the props it was given, and `await dragRow(from, to)` ends the drag on release and
  reports the reorder a frame later. `dropRowOutside(index)` drops a row off the list,
  `sortableResets()` counts the resets of its rows, and `moveDraxRoot()` with
  `draxRootOffset()` stand for the provider's place on screen.
- `castDoubleModule()`: for the native Cast module behind
  `@/modules/mpv-player/src/cast/CastModule`, driven by a `createCastDoubleState()` state:
  availability, devices, session, media status, channels and what was sent on them.
  `emitCastEvent()` and `emitCastSessionEvent()` fire its listeners as the module would. The
  JS side of the module runs for real on top of it.

### Writing your own mock

```typescript
jest.mock("@/utils/jellyfin/media/getStreamUrl", () => ({
  getDownloadStreamUrl: jest.fn(),
}));
```

- Jest hoists `jest.mock` above the imports, so its factory cannot reference an outer
  variable. Prefix the variable with `mock` (`mockStore`), or load the real module inside
  the factory with `jest.requireActual`.
- Each test file has its own module registry. A `jest.mock` in a spec replaces the wired
  double for that file only.
- A mock whose factory throws is a guard: it proves the code under test never loads the
  module (`hooks/notificationsOnTV.test.ts`). The spec passes without it, so never delete one
  as redundant. Say what it guards in a comment above it.

### Perf scenarios

`jest.perf.config.js` replaces the unit setup with `test-utils/perfSetup.ts` and maps none
of the unit package doubles, only the `tsx/cjs` stub. Performance scenarios can then
measure the cost of translation, the file system, icons, settings, images and network work
with their own scenario setup, and a `jest.unmock` in a scenario reaches the real package.
See [performance.md](performance.md).

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

## End-to-end

Unit tests prove the code in isolation; the end-to-end bench under `e2e/` proves the
system against the real test server and real playback targets. Three tiers: unit tests of
the bench itself and the shared receiver protocol vectors (`bun run test:unit` and
`bun run e2e:bench:test`), Maestro flows on emulators and simulators (`bun run e2e:smoke`),
and real devices driven from a developer machine. `e2e/README.md` has the commands, the private
configuration rules and where the evidence goes.
