# Learned Facts

This file contains facts about the codebase learned from past sessions. These are things Claude got wrong or needed clarification on, stored here to prevent the same mistakes in future sessions.

This file is auto-imported into CLAUDE.md and loaded at the start of each session.

## Facts

<!-- New facts will be appended below this line -->

- **Native bottom tabs + useRouter conflict**: When using `@bottom-tabs/react-navigation` with Expo Router, avoid using the `useRouter()` hook in components rendered at the provider level (outside the tab navigator). The hook subscribes to navigation state changes and can cause unexpected tab switches. Use the static `router` import from `expo-router` instead. _(2025-01-09)_

- **IntroSheet rendering location**: The `IntroSheet` component is rendered inside `IntroSheetProvider` which wraps the entire navigation stack. Any hooks in IntroSheet that interact with navigation state can affect the native bottom tabs. _(2025-01-09)_

- **Intro modal trigger location**: The intro modal trigger logic should be in the `Home.tsx` component, not in the tabs `_layout.tsx`. Triggering modals from tab layout can interfere with native bottom tabs navigation. _(2025-01-09)_

- **Tab folder naming**: The tab folders use underscore prefix naming like `(_home)` instead of just `(home)` based on the project's file structure conventions. _(2025-01-09)_
