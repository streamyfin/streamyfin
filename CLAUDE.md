# CLAUDE.md

@.claude/learned-facts.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Platform Considerations

- TV version uses `:tv` suffix for scripts
- Platform checks: `Platform.isTV`, `Platform.OS === "android"` or `"ios"`
- Some features disabled on TV (e.g., notifications, Chromecast)
- **TV Design**: Don't use purple accent colors on TV. Use white for focused states and `expo-blur` (`BlurView`) for backgrounds/overlays.
- **TV Typography**: Use `TVTypography` from `@/components/tv/TVTypography` for all text on TV. It provides consistent font sizes optimized for TV viewing distance.
- **TV Button Sizing**: Ensure buttons placed next to each other have the same size for visual consistency.
- **TV Focus Scale Padding**: Add sufficient padding around focusable items in tables/rows/columns/lists. The focus scale animation (typically 1.05x) will clip against parent containers without proper padding. Use `overflow: "visible"` on containers and add padding to prevent clipping.
- **TV Modals**: Never use overlay/absolute-positioned modals on TV as they don't handle the back button correctly. Instead, use the navigation-based modal pattern: create a Jotai atom for state, a hook that sets the atom and calls `router.push()`, and a page file in `app/(auth)/` that reads the atom and clears it on unmount. You must also add a `Stack.Screen` entry in `app/_layout.tsx` with `presentation: "transparentModal"` and `animation: "fade"` for the modal to render correctly as an overlay. See `useTVRequestModal` + `tv-request-modal.tsx` for reference.

### TV Component Rendering Pattern

**IMPORTANT**: The `.tv.tsx` file suffix only works for **pages** in the `app/` directory (resolved by Expo Router). It does NOT work for components - Metro bundler doesn't resolve platform-specific suffixes for component imports.

**Pattern for TV-specific components**:
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

### TV Option Selector Pattern (Dropdowns/Multi-select)

For dropdown/select components on TV, use a **bottom sheet with horizontal scrolling**. This pattern is ideal for TV because:
- Horizontal scrolling is natural for TV remotes (left/right D-pad)
- Bottom sheet takes minimal screen space
- Focus-based navigation works reliably

**Key implementation details:**

1. **Use absolute positioning instead of Modal** - React Native's `Modal` breaks the TV focus chain. Use an absolutely positioned `View` overlay instead:
```typescript
<View style={{
  position: "absolute",
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  justifyContent: "flex-end",
  zIndex: 1000,
}}>
  <BlurView intensity={80} tint="dark" style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
    {/* Content */}
  </BlurView>
</View>
```

2. **Horizontal ScrollView with focusable cards**:
```typescript
<ScrollView
  horizontal
  showsHorizontalScrollIndicator={false}
  style={{ overflow: "visible" }}
  contentContainerStyle={{ paddingHorizontal: 48, paddingVertical: 10, gap: 12 }}
>
  {options.map((option, index) => (
    <TVOptionCard
      key={index}
      hasTVPreferredFocus={index === selectedIndex}
      onPress={() => { onSelect(option.value); onClose(); }}
      // ...
    />
  ))}
</ScrollView>
```

3. **Focus handling on cards** - Use `Pressable` with `onFocus`/`onBlur` and `hasTVPreferredFocus`:
```typescript
<Pressable
  onPress={onPress}
  onFocus={() => { setFocused(true); animateTo(1.05); }}
  onBlur={() => { setFocused(false); animateTo(1); }}
  hasTVPreferredFocus={hasTVPreferredFocus}
>
  <Animated.View style={{ transform: [{ scale }], backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.08)" }}>
    <Text style={{ color: focused ? "#000" : "#fff" }}>{label}</Text>
  </Animated.View>
</Pressable>
```

4. **Add padding for scale animations** - When items scale on focus, add enough padding (`overflow: "visible"` + `paddingVertical`) so scaled items don't clip.

**Reference implementation**: See `TVOptionSelector` and `TVOptionCard` in `components/ItemContent.tv.tsx`

### TV Focus Management for Overlays/Modals

**CRITICAL**: When displaying overlays (bottom sheets, modals, dialogs) on TV, you must explicitly disable focus on all background elements. Without this, the TV focus engine will rapidly switch between overlay and background elements, causing a focus loop that freezes navigation.

**Solution**: Add a `disabled` prop to every focusable component and pass `disabled={isModalOpen}` when an overlay is visible:

```typescript
// 1. Track modal state
const [openModal, setOpenModal] = useState<ModalType | null>(null);
const isModalOpen = openModal !== null;

// 2. Each focusable component accepts disabled prop
const TVFocusableButton: React.FC<{
  onPress: () => void;
  disabled?: boolean;
}> = ({ onPress, disabled }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    focusable={!disabled}
    hasTVPreferredFocus={isFirst && !disabled}
  >
    {/* content */}
  </Pressable>
);

// 3. Pass disabled to all background components when modal is open
<TVFocusableButton onPress={handlePress} disabled={isModalOpen} />
```

**Reference implementation**: See `settings.tv.tsx` for complete example with `TVSettingsOptionButton`, `TVSettingsToggle`, `TVSettingsStepper`, etc.

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
