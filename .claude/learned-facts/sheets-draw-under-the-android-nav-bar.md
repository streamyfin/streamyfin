# Sheets Draw Under the Android Navigation Bar

**Date**: 2026-10-23
**Category**: ui
**Key files**: `hooks/useActionSheet.ts`, `components/common/SheetContent.tsx`

## Detail

The app draws edge to edge, so a sheet reaches under the Android navigation
bar unless its content is padded by the bottom inset. Use `useActionSheet` from
`@/hooks/useActionSheet`, not the library's, and put `showModal` content in
`SheetView` or `SheetScrollView`.
