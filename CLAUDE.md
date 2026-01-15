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
