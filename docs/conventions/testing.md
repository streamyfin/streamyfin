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

**Mock the boundary and run the app's logic for real.** A double of app logic can drift
from the real code, and a broken spec keeps passing. A double of the boundary keeps specs
fast and deterministic and costs no coverage.

Boundary doubles live in `test-utils/` and are wired once for every spec, so a spec does
not repeat their setup. A spec declares only what is specific to it.

### Boundary or app logic

Classify a module by what it does, not by where it lives. `utils/log.tsx` is app code, but
it is a boundary.

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
| `@/utils/atoms/settings` | App logic | Callers branch on every setting |
| `@/providers/JellyfinProvider` | App logic | The session decides what each request carries |
| `@/hooks/useAppRouter` | App logic | Adds `offline=true` inside an offline context |
| `@/utils/customHeaders` | App logic | Decides which headers and URLs a request uses |

When the two tests above are unclear, count the specs that already mock the module and read
what their doubles do. If most of them only silence it, it is a boundary: wire it once. If
they return spec-specific values, it is app logic: leave it to each spec.

The behaviour test wins over the count. Most doubles of `@/constants/TVTypography` only
silence it, but it reads settings and reaches no boundary, so it stays app logic.

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
   `jest.mocked(Notifications.getPermissionsAsync)`, `pressTVBack()`, `jest.mocked(jellyfinProbe)`,
   `appRouter`, `fakeFiles`, `clearMmkv()`, `clearSecureStore()`, `setJellyfinHeaders()`.
   If the real function is pure, use it.
6. **Do not depend on mock state left by another test.** `clearMocks` is on, so call counts
   reset before each test. Implementations set with `mockReturnValue` or
   `mockImplementation` are kept. Set them in the test or in `beforeEach`, or call
   `mockReset()` on one mock to start from an empty `jest.fn()`. Never call
   `jest.resetAllMocks()`: it strips the defaults of every wired double, so
   `readFromLog()` and `getPermissionsAsync()` start returning `undefined`.
7. **Restore spies and timers.** A `jest.spyOn` or fake timer stays active until it is
   undone. Call `mockRestore()` or `jest.useRealTimers()` in `afterEach`.
8. **Assert on results, not on the double.** Check what the user sees or what crossed the
   boundary (a request sent, a route pushed, an error reported). A test that counts calls to
   an internal double breaks on every refactor.

### What is wired

- **Packages** are mapped in `jest.config.js` (`moduleNameMapper`).
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
- `stubModules` also exports `expoWithoutNativeModule`, `onlineModule` and
  `emptyTVTypographyModule`.

### Writing your own mock

```typescript
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
}));
```

- Jest hoists `jest.mock` above the imports, so its factory cannot reference an outer
  variable. Prefix the variable with `mock` (`mockStore`), or load the real module inside
  the factory with `jest.requireActual`.
- Each test file has its own module registry. A `jest.mock` in a spec replaces the wired
  double for that file only.

### Perf scenarios

`jest.perf.config.js` keeps the package mappings except `expo-router`, `react-i18next`,
`expo-file-system` and `@expo/vector-icons`, and replaces the unit setup file with
`test-utils/perfSetup.ts`. A scenario therefore measures the real cost of translation, the
file system, icons, settings, images and the network. See [performance.md](performance.md).

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
