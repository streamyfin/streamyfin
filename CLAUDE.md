# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Learned Facts Index

IMPORTANT: When encountering issues related to these topics, or when implementing new features that touch these areas, prefer retrieval-led reasoning -- read the relevant fact file in `.claude/learned-facts/` before relying on assumptions.

Navigation:
- `native-bottom-tabs-userouter-conflict` | useRouter() at provider level causes tab switches; use static router import
- `introsheet-rendering-location` | IntroSheet in IntroSheetProvider affects native bottom tabs via nav state hooks
- `intro-modal-trigger-location` | Trigger in Home.tsx, not tabs _layout.tsx
- `tab-folder-naming` | Use underscore prefix: (_home) not (home)

UI/Headers:
- `macos-header-buttons-fix` | macOS Catalyst: use RNGH Pressable, not RN TouchableOpacity
- `header-button-locations` | Defined in _layout.tsx, HeaderBackButton, Chromecast, RoundButton, etc.
- `stack-screen-header-configuration` | Sub-pages need explicit Stack.Screen with headerTransparent + back button

State/Data:
- `use-network-aware-query-client-limitations` | Object.create breaks private fields; only for invalidateQueries
- `mark-as-played-flow` | PlayedStatus→useMarkAsPlayed→playbackManager with optimistic updates

Native Modules:
- `mpv-tvos-player-exit-freeze` | mpv_terminate_destroy deadlocks main thread; use DispatchQueue.global()
- `mpv-avfoundation-composite-osd-ordering` | MUST follow vo=avfoundation, before hwdec options
- `thread-safe-state-for-stop-flags` | Stop flags need synchronous setter (stateQueue.sync not async)
- `native-swiftui-view-sizing` | Need explicit frame + intrinsicContentSize override in ExpoView

TV Platform:
- `tv-modals-must-use-navigation-pattern` | Use atom+router.push(), never overlay/absolute modals
- `tv-grid-layout-pattern` | ScrollView+flexWrap, not FlatList numColumns
- `tv-horizontal-padding-standard` | TV_HORIZONTAL_PADDING=60, not old TV_SCALE_PADDING=20
- `streamystats-components-location` | components/home/Streamystats*.tv.tsx, watchlists/[watchlistId].tsx
- `platform-specific-file-suffix-does-not-work` | .tv.tsx doesn't work; use Platform.isTV conditional rendering

## Project Overview

Streamyfin is a cross-platform Jellyfin video streaming client built with Expo (React Native). It supports mobile (iOS/Android) and TV platforms, with features including offline downloads, Chromecast support, and Jellyseerr integration.

## Development Commands

**CRITICAL: Always use `bun` for package management. Never use `npm`, `yarn`, or `npx`.**

```bash
# Setup
bun i && bun run submodule-reload

# Development builds
bun run prebuild              # Mobile prebuild
bun run ios                   # Run iOS
bun run android               # Run Android

# TV builds (suffix with :tv)
bun run prebuild:tv
bun run ios:tv
bun run android:tv

# Code quality
bun run typecheck             # TypeScript check
bun run check                 # BiomeJS check
bun run lint                  # BiomeJS lint + fix
bun run format                # BiomeJS format
bun run test                  # Run all checks (typecheck, lint, format, doctor)

# iOS-specific
bun run ios:install-metal-toolchain  # Fix "missing Metal Toolchain" build errors
```

## Tech Stack

- **Runtime**: Bun
- **Framework**: React Native (Expo SDK 54)
- **Language**: TypeScript (strict mode)
- **State Management**: Jotai (global state atoms) + React Query (server state)
- **API**: Jellyfin SDK (`@jellyfin/sdk`)
- **Navigation**: Expo Router (file-based)
- **Linting/Formatting**: BiomeJS
- **Storage**: react-native-mmkv

## Architecture

### File Structure

- `app/` - Expo Router screens with file-based routing
- `components/` - Reusable UI components
- `providers/` - React Context providers
- `hooks/` - Custom React hooks
- `utils/` - Utilities including Jotai atoms
- `modules/` - Native modules (vlc-player, mpv-player, background-downloader)
- `translations/` - i18n translation files

### Key Patterns

**State Management**:
- Global state uses Jotai atoms in `utils/atoms/`
- `settingsAtom` in `utils/atoms/settings.ts` for app settings
  - **IMPORTANT**: When adding a setting to the settings atom, ensure it's toggleable in the settings view (either TV or mobile, depending on the feature scope)
- `apiAtom` and `userAtom` in `providers/JellyfinProvider.tsx` for auth state
- Server state uses React Query with `@tanstack/react-query`

**Jellyfin API Access**:
- Use `apiAtom` from `JellyfinProvider` for authenticated API calls
- Access user via `userAtom`
- Use Jellyfin SDK utilities from `@jellyfin/sdk/lib/utils/api`

**Navigation**:
- File-based routing in `app/` directory
- Tab navigation: `(home)`, `(search)`, `(favorites)`, `(libraries)`, `(watchlists)`
- Shared routes use parenthesized groups like `(home,libraries,search,favorites,watchlists)`
- **IMPORTANT**: Always use `useAppRouter` from `@/hooks/useAppRouter` instead of `useRouter` from `expo-router`. This custom hook automatically handles offline mode state preservation across navigation:
  ```typescript
  // ✅ Correct
  import useRouter from "@/hooks/useAppRouter";
  const router = useRouter();
  
  // ❌ Never use this
  import { useRouter } from "expo-router";
  import { router } from "expo-router";
  ```

**Offline Mode**:
- Use `OfflineModeProvider` from `@/providers/OfflineModeProvider` to wrap pages that support offline content
- Use `useOfflineMode()` hook to check if current context is offline
- The `useAppRouter` hook automatically injects `offline=true` param when navigating within an offline context

**Providers** (wrapping order in `app/_layout.tsx`):
1. JotaiProvider
2. QueryClientProvider
3. JellyfinProvider (auth, API)
4. NetworkStatusProvider
5. PlaySettingsProvider
6. WebSocketProvider
7. DownloadProvider
8. MusicPlayerProvider

### Native Modules

Located in `modules/`:
- `vlc-player` - VLC video player integration
- `mpv-player` - MPV video player integration (iOS)
- `background-downloader` - Background download functionality
- `sf-player` - Swift player module

### Path Aliases

Use `@/` prefix for imports (configured in `tsconfig.json`):
```typescript
import { useSettings } from "@/utils/atoms/settings";
import { apiAtom } from "@/providers/JellyfinProvider";
```

## Coding Standards

- Use TypeScript for all files (no .js)
- Use functional React components with hooks
- Use Jotai atoms for global state, React Query for server state
- Follow BiomeJS formatting rules (2-space indent, semicolons, LF line endings)
- Handle both mobile and TV navigation patterns
- Use existing atoms, hooks, and utilities before creating new ones
- Use Conventional Commits: `feat(scope):`, `fix(scope):`, `chore(scope):`
- **Translations**: When adding a translation key to a Text component, ensure the key exists in both `translations/en.json` and `translations/sv.json`. Before adding new keys, check if an existing key already covers the use case.

## Platform Considerations

- TV version uses `:tv` suffix for scripts
- Platform checks: `Platform.isTV`, `Platform.OS === "android"` or `"ios"`
- Some features disabled on TV (e.g., notifications, Chromecast)
- **TV Design**: Don't use purple accent colors on TV. Use white for focused states and `expo-blur` (`BlurView`) for backgrounds/overlays.
- **TV Typography**: Use `TVTypography` from `@/components/tv/TVTypography` for all text on TV. It provides consistent font sizes optimized for TV viewing distance.
- **TV Button Sizing**: Ensure buttons placed next to each other have the same size for visual consistency.
- **TV Focus Scale Padding**: Add sufficient padding around focusable items in tables/rows/columns/lists. The focus scale animation (typically 1.05x) will clip against parent containers without proper padding. Use `overflow: "visible"` on containers and add padding to prevent clipping.
- **TV Modals**: Never use React Native's `Modal` component or overlay/absolute-positioned modals for full-screen modals on TV. Use the navigation-based modal pattern instead. **See [docs/tv-modal-guide.md](docs/tv-modal-guide.md) for detailed documentation.**

### TV Component Rendering Pattern

**IMPORTANT**: The `.tv.tsx` file suffix does NOT work in this project - neither for pages nor components. Metro bundler doesn't resolve platform-specific suffixes. Always use `Platform.isTV` conditional rendering instead.

**Pattern for TV-specific pages and components**:
```typescript
// In page file (e.g., app/login.tsx)
import { Platform } from "react-native";
import { Login } from "@/components/login/Login";
import { TVLogin } from "@/components/login/TVLogin";

const LoginPage: React.FC = () => {
  if (Platform.isTV) {
    return <TVLogin />;
  }
  return <Login />;
};

export default LoginPage;
```

- Create separate component files for mobile and TV (e.g., `MyComponent.tsx` and `TVMyComponent.tsx`)
- Use `Platform.isTV` to conditionally render the appropriate component
- TV components typically use `TVInput`, `TVServerCard`, and other TV-prefixed components with focus handling
- **Never use `.tv.tsx` file suffix** - it will not be resolved correctly

### TV Option Selectors and Focus Management

For dropdown/select components, bottom sheets, and overlay focus management on TV, see [docs/tv-modal-guide.md](docs/tv-modal-guide.md).

### TV Focus Flickering Between Zones (Lists with Headers)

When you have a page with multiple focusable zones (e.g., a filter bar above a grid), the TV focus engine can rapidly flicker between elements when navigating between zones. This is a known issue with React Native TV.

**Solutions:**

1. **Use FlatList instead of FlashList for TV** - FlashList has known focus issues on TV platforms. Use regular FlatList with `Platform.isTV` check:
```typescript
{Platform.isTV ? (
  <FlatList
    data={items}
    renderItem={renderTVItem}
    removeClippedSubviews={false}
    // ...
  />
) : (
  <FlashList data={items} renderItem={renderItem} />
)}
```

2. **Add `removeClippedSubviews={false}`** - Prevents the list from unmounting off-screen items, which can cause focus to "fall through" to other elements.

3. **Only ONE element should have `hasTVPreferredFocus`** - Never have multiple elements competing for initial focus. Choose one element (usually the first filter button or first list item) to have preferred focus:
```typescript
// ✅ Good - only first filter button has preferred focus
<TVFilterButton hasTVPreferredFocus={index === 0} />
<TVFocusablePoster /> // No hasTVPreferredFocus

// ❌ Bad - both compete for focus
<TVFilterButton hasTVPreferredFocus />
<TVFocusablePoster hasTVPreferredFocus={index === 0} />
```

4. **Keep headers/filter bars outside the list** - Instead of using `ListHeaderComponent`, render the filter bar as a separate View above the FlatList:
```typescript
<View style={{ flex: 1 }}>
  {/* Filter bar - separate from list */}
  <View style={{ flexDirection: "row", gap: 12 }}>
    <TVFilterButton />
    <TVFilterButton />
  </View>

  {/* Grid */}
  <FlatList data={items} renderItem={renderTVItem} />
</View>
```

5. **Avoid multiple scrollable containers** - Don't use ScrollView for the filter bar if you have a FlatList below. Use a simple View instead to prevent focus conflicts between scrollable containers.

**Reference implementation**: See `app/(auth)/(tabs)/(libraries)/[libraryId].tsx` for the TV filter bar + grid pattern.

### TV Focus Guide Navigation (Non-Adjacent Sections)

When you need focus to navigate between sections that aren't geometrically aligned (e.g., left-aligned buttons to a horizontal ScrollView), use `TVFocusGuideView` with the `destinations` prop:

```typescript
// 1. Track destination with useState (NOT useRef - won't trigger re-renders)
const [firstCardRef, setFirstCardRef] = useState<View | null>(null);

// 2. Place invisible focus guide between sections
{firstCardRef && (
  <TVFocusGuideView
    destinations={[firstCardRef]}
    style={{ height: 1, width: "100%" }}
  />
)}

// 3. Target component must use forwardRef
const MyCard = React.forwardRef<View, Props>(({ ... }, ref) => (
  <Pressable ref={ref} ...>
    ...
  </Pressable>
));

// 4. Pass state setter as callback ref to first item
{items.map((item, index) => (
  <MyCard
    ref={index === 0 ? setFirstCardRef : undefined}
    ...
  />
))}
```

**For detailed documentation and bidirectional navigation patterns, see [docs/tv-focus-guide.md](docs/tv-focus-guide.md)**

**Reference implementation**: See `components/ItemContent.tv.tsx` for bidirectional focus navigation between playback options and cast list.
