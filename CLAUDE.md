# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

This file is an index, not a manual. When a topic below points at a document, read that
document before relying on assumptions: most of these rules exist because their absence
already broke something, and the reason is written down where the rule lives.

## Keeping this file true

This file is loaded into context on every session, so a stale line in it is not a missing
answer, it is a confident wrong one. When a change makes something here inaccurate, or
adds something worth knowing, update it in the same PR. The triggers:

- a tab group, route group or top-level directory added or removed
- a native module added or removed
- a provider added to the stack in `app/_layout.tsx`, or moved within it
- an SDK, runtime or major dependency bump that dates the stack section
- a new convention worth writing down: it goes to `docs/conventions/` with a row in the
  table below
- a fact that cost you an afternoon to find: it goes to `.claude/learned-facts/` with a
  line in the index

`CLAUDE.test.ts` pins the native module list, the tab groups and the convention index in
both directions, so drift in those fails the suite instead of surviving for months.
Everything else depends on you noticing.

## Conventions

Read the relevant one before writing code in that area.

| Document | Read it when |
| --- | --- |
| [docs/conventions/constants.md](docs/conventions/constants.md) | Adding a threshold, interval, ratio, storage key, or any value used twice |
| [docs/conventions/contributing-flow.md](docs/conventions/contributing-flow.md) | Opening, describing, or reviewing a PR |
| [docs/conventions/tv.md](docs/conventions/tv.md) | Touching anything that renders on Apple TV or Android TV |

Deep dives: [tv-modal-guide.md](docs/tv-modal-guide.md),
[tv-focus-guide.md](docs/tv-focus-guide.md), [tv-discovery.md](docs/tv-discovery.md),
[nested-modals.md](docs/nested-modals.md), [custom-headers.md](docs/custom-headers.md).

## Learned facts

One file per hard won fact in `.claude/learned-facts/`. Read the relevant one before
debugging in that area.

Navigation:
- `native-bottom-tabs-userouter-conflict` | useRouter() at provider level causes tab switches; use static router import
- `introsheet-rendering-location` | IntroSheet in IntroSheetProvider affects native bottom tabs via nav state hooks
- `intro-modal-trigger-location` | Trigger in Home.tsx, not tabs _layout.tsx

UI and headers:
- `macos-header-buttons-fix` | macOS Catalyst: use RNGH Pressable, not RN TouchableOpacity
- `header-button-locations` | Defined in _layout.tsx, HeaderBackButton, Chromecast, RoundButton, etc.
- `stack-screen-header-configuration` | Sub-pages need explicit Stack.Screen with headerTransparent + back button

State and data:
- `use-network-aware-query-client-limitations` | Object.create breaks private fields; only for invalidateQueries
- `mark-as-played-flow` | PlayedStatus -> useMarkAsPlayed -> playbackManager with optimistic updates

Native modules:
- `expo-view-props-fail-silently` | `try? prop.set()` drops failed prop conversions with NO error; use a JSON string prop
- `mpv-tvos-player-exit-freeze` | mpv_terminate_destroy deadlocks main thread; use DispatchQueue.global()
- `mpv-avfoundation-composite-osd-ordering` | MUST follow vo=avfoundation, before hwdec options
- `thread-safe-state-for-stop-flags` | Stop flags need synchronous setter (stateQueue.sync not async)
- `native-swiftui-view-sizing` | Need explicit frame + intrinsicContentSize override in ExpoView

TV platform:
- `tv-modals-must-use-navigation-pattern` | Use atom+router.push(), never overlay/absolute modals
- `tv-grid-layout-pattern` | ScrollView+flexWrap, not FlatList numColumns
- `tv-horizontal-padding-standard` | TV_HORIZONTAL_PADDING=60, not old TV_SCALE_PADDING=20
- `streamystats-components-location` | components/home/Streamystats*.tv.tsx, watchlists/[watchlistId].tsx
- `platform-specific-file-suffix-does-not-work` | .tv.* only resolves under EXPO_TV=1; require the TV file explicitly behind Platform.isTV

## Project overview

Streamyfin is a cross platform Jellyfin client built with Expo and React Native. It runs
on iOS, Android, Apple TV and Android TV, with offline downloads, Chromecast and
Jellyseerr integration.

## Commands

**Always use `bun`. Never `npm`, `yarn` or `npx`.**

```bash
# Setup
bun i && bun run submodule-reload

# Mobile
bun run prebuild
bun run ios
bun run android

# TV (same commands, :tv suffix)
bun run prebuild:tv
bun run ios:tv
bun run android:tv

# Quality
bun run typecheck            # TypeScript
bun run check                # Biome, read only
bun run lint                 # Biome with fixes
bun run format               # Biome formatter
bun run test:unit            # Unit tests
bun run test                 # The full gate: typecheck, unit, lint, format, i18n, doctor

# iOS specific
bun run ios:install-metal-toolchain   # Fixes "missing Metal Toolchain" build errors
```

## Stack

- **Runtime and package manager**: Bun
- **Framework**: Expo SDK 57, React 19, `react-native-tvos`
- **Language**: TypeScript, strict mode
- **State**: Jotai for global state, React Query for server state
- **API**: Jellyfin SDK (`@jellyfin/sdk`)
- **Navigation**: Expo Router, file based
- **Lint and format**: Biome
- **Storage**: `react-native-mmkv`

## Repository layout

| Path | Holds |
| --- | --- |
| `app/` | Expo Router screens, file based routing |
| `components/` | Reusable UI |
| `providers/` | React context providers |
| `hooks/` | Custom hooks |
| `utils/` | Utilities, including the Jotai atoms in `utils/atoms/` |
| `constants/` | Shared and tunable values, see the constants convention |
| `modules/` | Local native modules |
| `services/` | Long lived services (playback) |
| `packages/` | Local shims resolved by Metro |
| `targets/` | Extra native targets (top shelf, download activity) |
| `plugins/` | Expo config plugins |
| `patches/` | Patch package overrides |
| `augmentations/` | Type augmentations |
| `test-utils/` | Shared test doubles: Jellyfin API, MMKV, custom headers, React Native |
| `translations/` | i18n catalogues, `en.json` is the only source |
| `scripts/` | Repo tooling run through bun |
| `docs/` | Conventions and deep dives |

## Key patterns

**State**
- Global state is Jotai atoms in `utils/atoms/`.
- `settingsAtom` in `utils/atoms/settings.ts` holds app settings. A new setting must also
  be toggleable in the settings UI, mobile or TV depending on its scope, or it is dead.
- `apiAtom` and `userAtom` in `providers/JellyfinProvider.tsx` hold auth state.
- Server state goes through React Query.

**Jellyfin API**
- Authenticated calls use `apiAtom`, the current user comes from `userAtom`.
- Prefer the SDK helpers from `@jellyfin/sdk/lib/utils/api` over hand rolled requests.

**Navigation**
- File based routing under `app/`.
- Tab groups: `(home)`, `(search)`, `(favorites)`, `(libraries)`, `(watchlists)`,
  `(custom-links)`, `(settings)`. Routes shared by several tabs live in the combined
  group `(home,libraries,search,favorites,watchlists)`.
- **IMPORTANT**: use `useAppRouter` from `@/hooks/useAppRouter`, never `useRouter` or the
  static `router` from `expo-router`. The wrapper preserves offline mode across
  navigation.

  ```typescript
  // Correct
  import useRouter from "@/hooks/useAppRouter";
  const router = useRouter();

  // Never
  import { useRouter } from "expo-router";
  ```

**Offline mode**
- Wrap pages that serve downloaded content in `OfflineModeProvider` from
  `@/providers/OfflineModeProvider`.
- `useOfflineMode()` reports whether the current context is offline.
- `useAppRouter` injects `offline=true` when navigating inside an offline context.

**Provider stack** (`app/_layout.tsx`, outermost first). The order is load bearing: each
provider below depends on the ones above it.

```text
PersistQueryClientProvider
  JellyfinProvider          auth, api
    InactivityProvider
      WifiSsidProvider
        ServerUrlProvider
          NetworkStatusProvider
            PlaySettingsProvider
              LogProvider
                WebSocketProvider
                  DownloadProvider
                    NativePlayerProvider
                      MusicPlayerProvider
                        GlobalModalProvider
                          BottomSheetModalProvider
                            IntroSheetProvider
                              ThemeProvider
```

`JotaiProvider` and `ActionSheetProvider` wrap the tree higher up, at the root layout.

**Native modules** in `modules/`: `mpv-player` (the native player, iOS and Android),
`exoplayer-player`, `background-downloader`, `glass-poster`, `hero-carousel`,
`system-volume`, `top-shelf-cache`, `tv-recommendations`, `tv-search`, `tv-user-profile`,
`wifi-ssid`.

**Path aliases**: `@/` maps to the repo root.

```typescript
import { useSettings } from "@/utils/atoms/settings";
import { apiAtom } from "@/providers/JellyfinProvider";
```

## Coding standards

- TypeScript everywhere. The only exceptions are the config files whose loaders cannot
  parse TypeScript: `babel.config.js`, `metro.config.js`, `react-native.config.js`,
  `tailwind.config.js`.
- Functional components with hooks.
- Biome formatting: two space indent, semicolons, LF endings.
- Reuse the existing atoms, hooks and utilities before adding new ones.
- Comments explain why, not what. Reach for one at a hook, an early return, or a
  non obvious decision, and leave the obvious lines alone.
- Shared or tunable values go to `constants/`. See
  [docs/conventions/constants.md](docs/conventions/constants.md).
- Behaviour changes come with tests. A bug fix starts with a test that fails on the
  reported behaviour.
- **Translations**: add keys to `translations/en.json` only. Every other catalogue is
  generated by Crowdin and hand edits are overwritten. Check for an existing key first,
  and keep one key per whole sentence instead of assembling sentences from fragments.
- **Server images**: for images hosted by Jellyfin or Jellyseerr, import `Image` from
  `@/components/common/ServerImage` rather than `expo-image`, so the user's custom proxy
  auth headers are attached. Bundled assets and data URIs can use `expo-image` directly.
  See [docs/custom-headers.md](docs/custom-headers.md).
- Conventional Commits for commits and PR titles: `feat(scope):`, `fix(scope):`,
  `chore(scope):`. CI validates the PR title.

## Platform notes

- Platform checks: `Platform.isTV`, `Platform.OS === "android" | "ios"`.
- TV builds use the `:tv` script suffix.
- Some features are off on TV, notifications and Chromecast among them.
- The rest of the TV rules, covering focus, modals, typography and lists, live in
  [docs/conventions/tv.md](docs/conventions/tv.md). Read it before touching TV code.
