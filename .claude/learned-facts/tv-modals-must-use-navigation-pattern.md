# TV Modals Must Use Navigation Pattern

**Date**: 2026-01-24
**Category**: tv
**Key files**: `hooks/useTVOptionModal.ts`, `app/(auth)/tv-option-modal.tsx`

## Detail

On TV, never use overlay/absolute-positioned modals (like `TVOptionSelector` at the page level). They don't handle the back button correctly. Always use the navigation-based modal pattern: Jotai atom + hook that calls `router.push()` + page in `app/(auth)/`. Use the existing `useTVOptionModal` hook and `tv-option-modal.tsx` page for option selection. `TVOptionSelector` is only appropriate as a sub-selector *within* a navigation-based modal page.
