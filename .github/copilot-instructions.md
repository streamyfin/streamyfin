# Copilot Instructions for Streamyfin

## Project Overview

Streamyfin is a cross-platform Jellyfin video streaming client built with Expo (React Native).  
It supports mobile (iOS/Android) and TV platforms, integrates with Jellyfin and Seerr APIs,
and provides seamless media streaming with offline capabilities and Chromecast support.

## Main Technologies

- **Runtime**: Bun (JavaScript/TypeScript execution)
- **Framework**: React Native (Expo)
- **Language**: TypeScript (strict mode)
- **State Management**: Jotai (global state) + React Query (server state)
- **API SDK**: Jellyfin SDK (TypeScript)
- **Navigation**: Expo Router (file-based routing)
- **Code Quality**: BiomeJS (formatting/linting)
- **Build Platform**: EAS (Expo Application Services)
- **CI/CD**: GitHub Actions with Bun

## Package Management

**CRITICAL: ALWAYS use `bun` for all package management operations**

- **NEVER use `npm`, `yarn` or `npx` commands**
- Use `bun install` instead of `npm install` or `yarn install`
- Use `bun add <package>` instead of `npm install <package>`
- Use `bun remove <package>` instead of `npm uninstall <package>`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bunx <command>` instead of `npx <command>`
- For Expo: use `bunx create-expo-app` or `bunx @expo/cli`

## Code Structure

- `app/` – Main application code (screens, navigation, etc.)
- `components/` – Reusable UI components
- `providers/` – Context and API providers (e.g., JellyfinProvider.tsx)
- `utils/` – Utility functions and Jotai atoms
- `assets/` – Images and static assets
- `scripts/` – Automation scripts (Node.js, Bash)
- `plugins/` – Expo/Metro plugins

## Code Quality Standards

**CRITICAL: Code must be production-ready, reliable, and maintainable**

### Type Safety
- Use TypeScript for ALL files (no .js files)
- **NEVER use `any` type** - use proper types, generics, or `unknown` with type guards
- Use `@ts-expect-error` with detailed comments only when necessary (e.g., library limitations)
- When facing type issues, create proper type definitions and helper functions instead of using `any`
- Use type assertions (`as`) only as a last resort with clear documentation explaining why
- For Expo Router navigation: prefer string URLs with `URLSearchParams` over object syntax to avoid type conflicts
- Enable and respect strict TypeScript compiler options
- Define explicit return types for functions
- Use discriminated unions for complex state

### Code Reliability
- Implement comprehensive error handling with try-catch blocks
- Validate all external inputs (API responses, user input, query params)
- Handle edge cases explicitly (empty arrays, null, undefined)
- Use optional chaining (`?.`) and nullish coalescing (`??`) appropriately
- Add runtime checks for critical operations
- Implement proper loading and error states in components

### Best Practices
- Use descriptive English names for variables, functions, and components
- Prefer functional React components with hooks
- Use Jotai atoms for global state management
- Use React Query for server state and caching
- Follow BiomeJS formatting and linting rules
- Use `const` over `let`, avoid `var` entirely
- Implement proper error boundaries
- Use React.memo() for performance optimization when needed
- Handle both mobile and TV navigation patterns
- Write self-documenting code with clear intent
- Add comments only when code complexity requires explanation

## API Integration

- Use Jellyfin SDK for all server interactions
- Access authenticated APIs via `apiAtom` and `userAtom` from JellyfinProvider
- Implement proper loading states and error handling
- Use React Query for caching and background updates
- Handle offline scenarios gracefully

## Performance Optimization

- Leverage Bun's superior runtime performance
- Optimize FlatList components with proper props
- Use lazy loading for non-critical components
- Implement proper image caching strategies
- Monitor bundle size and use tree-shaking effectively

## Testing

- Use Bun's built-in test runner when possible
- Test files: `*.test.ts` or `*.test.tsx`
- Run tests with: `bun test`
- Mock external APIs in tests
- Focus on testing business logic and custom hooks

## Commit Messages

Use Conventional Commits (https://www.conventionalcommits.org/):
Exemples:
- `feat(player): add Chromecast support`
- `fix(auth): handle expired JWT tokens`
- `chore(deps): update Jellyfin SDK`

## Internationalization (i18n)

- **Primary workflow**: Always edit `translations/en.json` for new translation keys or updates
- **Translation files** (ar.json, ca.json, cs.json, de.json, etc.):
  - **NEVER add or remove keys** - Crowdin manages the key structure
  - **Editing translation values is safe** - Bidirectional sync handles merges
  - Prefer letting Crowdin translators update values, but direct edits work if needed
- **Crowdin workflow**:
  - New keys added to `en.json` sync to Crowdin automatically
  - Approved translations sync back to language files via GitHub integration
  - The source of truth is `en.json` for structure, Crowdin for translations

## Special Instructions

- Prioritize cross-platform compatibility (mobile + TV)
- Ensure accessibility for TV remote navigation
- Use existing atoms, hooks, and utilities before creating new ones
- Maintain compatibility with Expo and EAS workflows
- Always verify Bun compatibility when suggesting new dependencies

**Copilot: Please use these instructions to provide context-aware suggestions and code completions for this repository.**