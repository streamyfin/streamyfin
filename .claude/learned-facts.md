# Learned Facts

This file contains facts about the codebase learned from past sessions. These are things Claude got wrong or needed clarification on, stored here to prevent the same mistakes in future sessions.

This file is auto-imported into CLAUDE.md and loaded at the start of each session.

## Facts

<!-- New facts will be appended below this line -->

- **Native bottom tabs + useRouter conflict**: When using `@bottom-tabs/react-navigation` with Expo Router, avoid using the `useRouter()` hook in components rendered at the provider level (outside the tab navigator). The hook subscribes to navigation state changes and can cause unexpected tab switches. Use the static `router` import from `expo-router` instead. _(2025-01-09)_

- **IntroSheet rendering location**: The `IntroSheet` component is rendered inside `IntroSheetProvider` which wraps the entire navigation stack. Any hooks in IntroSheet that interact with navigation state can affect the native bottom tabs. _(2025-01-09)_

- **Intro modal trigger location**: The intro modal trigger logic should be in the `Home.tsx` component, not in the tabs `_layout.tsx`. Triggering modals from tab layout can interfere with native bottom tabs navigation. _(2025-01-09)_

- **Tab folder naming**: The tab folders use underscore prefix naming like `(_home)` instead of just `(home)` based on the project's file structure conventions. _(2025-01-09)_

- **macOS header buttons fix**: Header buttons (`headerRight`/`headerLeft`) don't respond to touches on macOS Catalyst builds when using standard React Native `TouchableOpacity`. Fix by using `Pressable` from `react-native-gesture-handler` instead. The library is already installed and `GestureHandlerRootView` wraps the app. _(2026-01-10)_

- **Header button locations**: Header buttons are defined in multiple places: `app/(auth)/(tabs)/(home)/_layout.tsx` (SettingsButton, SessionsButton, back buttons), `components/common/HeaderBackButton.tsx` (reusable), `components/Chromecast.tsx`, `components/RoundButton.tsx`, and dynamically via `navigation.setOptions()` in `components/home/Home.tsx` and `app/(auth)/(tabs)/(home)/downloads/index.tsx`. _(2026-01-10)_

- **useNetworkAwareQueryClient limitations**: The `useNetworkAwareQueryClient` hook uses `Object.create(queryClient)` which breaks QueryClient methods that use JavaScript private fields (like `getQueriesData`, `setQueriesData`, `setQueryData`). Only use it when you ONLY need `invalidateQueries`. For cache manipulation, use standard `useQueryClient` from `@tanstack/react-query`. _(2026-01-10)_

- **Mark as played flow**: The "mark as played" button uses `PlayedStatus` component → `useMarkAsPlayed` hook → `usePlaybackManager.markItemPlayed()`. The hook does optimistic updates via `setQueriesData` before calling the API. Located in `components/PlayedStatus.tsx` and `hooks/useMarkAsPlayed.ts`. _(2026-01-10)_

- **Stack screen header configuration**: Sub-pages under `(home)` need explicit `Stack.Screen` entries in `app/(auth)/(tabs)/(home)/_layout.tsx` with `headerTransparent: Platform.OS === "ios"`, `headerBlurEffect: "none"`, and a back button. Without this, pages show with wrong header styling. _(2026-01-10)_

- **MPV tvOS player exit freeze**: On tvOS, `mpv_terminate_destroy` can deadlock if called while blocking the main thread (e.g., via `queue.sync`). The fix is to run `mpv_terminate_destroy` on `DispatchQueue.global()` asynchronously, allowing it to access main thread for AVFoundation/GPU cleanup. Send `quit` command and drain events first. Located in `modules/mpv-player/ios/MPVLayerRenderer.swift`. _(2026-01-22)_

- **MPV avfoundation-composite-osd ordering**: On tvOS, the `avfoundation-composite-osd` option MUST be set immediately after `vo=avfoundation`, before any `hwdec` options. Skipping or reordering this causes the app to freeze when exiting the player. Set to "no" on tvOS (prevents gray tint), "yes" on iOS (for PiP subtitle support). _(2026-01-22)_

- **Thread-safe state for stop flags**: When using flags like `isStopping` that control loop termination across threads, the setter must be synchronous (`stateQueue.sync`) not async, otherwise the value may not be visible to other threads in time. _(2026-01-22)_

- **TV modals must use navigation pattern**: On TV, never use overlay/absolute-positioned modals (like `TVOptionSelector` at the page level). They don't handle the back button correctly. Always use the navigation-based modal pattern: Jotai atom + hook that calls `router.push()` + page in `app/(auth)/`. Use the existing `useTVOptionModal` hook and `tv-option-modal.tsx` page for option selection. `TVOptionSelector` is only appropriate as a sub-selector *within* a navigation-based modal page. _(2026-01-24)_

- **TV grid layout pattern**: For TV grids, use ScrollView with flexWrap instead of FlatList/FlashList with numColumns. FlatList's numColumns divides width evenly among columns which causes inconsistent item sizing. Use `flexDirection: "row"`, `flexWrap: "wrap"`, `justifyContent: "center"`, and `gap` for spacing. _(2026-01-25)_

- **TV horizontal padding standard**: TV pages should use `TV_HORIZONTAL_PADDING = 60` to match other TV pages like Home, Search, etc. The old `TV_SCALE_PADDING = 20` was too small. _(2026-01-25)_

- **Native SwiftUI view sizing**: When creating Expo native modules with SwiftUI views, the view needs explicit dimensions. Use a `width` prop passed from React Native, set an explicit `.frame(width:height:)` in SwiftUI, and override `intrinsicContentSize` in the ExpoView wrapper to report the correct size to React Native's layout system. Using `.aspectRatio(contentMode: .fit)` alone causes inconsistent sizing. _(2026-01-25)_

- **Streamystats components location**: Streamystats TV components are at `components/home/StreamystatsRecommendations.tv.tsx` and `components/home/StreamystatsPromotedWatchlists.tv.tsx`. The watchlist detail page (which shows items in a grid) is at `app/(auth)/(tabs)/(watchlists)/[watchlistId].tsx`. _(2026-01-25)_

- **Platform-specific file suffix (.tv.tsx) does NOT work**: The `.tv.tsx` file suffix does NOT work for either pages or components in this project. Metro bundler doesn't resolve platform-specific suffixes. Instead, use `Platform.isTV` conditional rendering within a single file. For pages: check `Platform.isTV` at the top and return the TV component early. For components: create separate `MyComponent.tsx` and `TVMyComponent.tsx` files and use `Platform.isTV` to choose which to render. _(2026-01-26)_