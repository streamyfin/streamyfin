# Mark as Played Flow

**Date**: 2026-01-10
**Category**: state-management
**Key files**: `components/PlayedStatus.tsx`, `hooks/useMarkAsPlayed.ts`

## Detail

The "mark as played" button uses `PlayedStatus` component → `useMarkAsPlayed` hook → `usePlaybackManager.markItemPlayed()`. The hook does optimistic updates via `setQueriesData` before calling the API. Located in `components/PlayedStatus.tsx` and `hooks/useMarkAsPlayed.ts`.
