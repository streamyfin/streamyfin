# Copilot Instructions for Streamyfin

## Project Overview

Streamyfin is a cross-platform Jellyfin video streaming client built with Expo (React Native).  
It supports mobile (iOS/Android) and TV platforms, and integrates with Jellyfin and Jellyseerr APIs.

## Main Technologies

- React Native (Expo)
- TypeScript
- React Query
- Jotai (state management)
- Jellyfin SDK (TypeScript)
- BiomeJS (code formatting/linting)
- EAS (Expo Application Services)
- Shell scripting (for automation)
- GitHub Actions (CI/CD)

## Code Structure

- `app/` – Main application code (screens, navigation, etc.)
- `components/` – Reusable UI components
- `providers/` – Context and API providers (e.g., JellyfinProvider.tsx)
- `utils/` – Utility functions and atoms
- `assets/` – Images and static assets
- `scripts/` – Automation scripts (Node.js, Bash)
- `plugins/` – Expo/Metro plugins
- `README.md` – Project documentation

## Coding Conventions

- Use TypeScript for all new code.
- Prefer functional React components.
- Use hooks for state and side effects.
- Use Jotai for global state.
- Use React Query for data fetching/caching.
- Use BiomeJS for formatting and linting.
- Follow the established folder structure for screens/components.

## API Usage

- Use the Jellyfin SDK for all server interactions.
- Use the `apiAtom` and `userAtom` from `JellyfinProvider` for authenticated API calls.
- For navigation, use `expo-router`.

## Commit Messages

- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (e.g., `feat:`, `fix:`, `chore:`).
- Example: `feat(player): add Chromecast support`

## Special Instructions

- When suggesting code, prefer using existing atoms, hooks, and utility functions.
- When adding new features, ensure they are accessible via both mobile and TV navigation if relevant.
- When updating dependencies or scripts, check for compatibility with Expo and EAS.

---

**Copilot: Please use these instructions to provide context-aware suggestions and code completions for this repository.**