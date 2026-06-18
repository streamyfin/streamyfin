# Platform-Specific File Suffix (.tv.tsx) Does NOT Work

**Date**: 2026-01-26
**Category**: tv
**Key files**: `app/`, `components/`

## Detail

The `.tv.tsx` file suffix does NOT work for either pages or components in this project. Metro bundler doesn't resolve platform-specific suffixes. Instead, use `Platform.isTV` conditional rendering within a single file. For pages: check `Platform.isTV` at the top and return the TV component early. For components: create separate `MyComponent.tsx` and `TVMyComponent.tsx` files and use `Platform.isTV` to choose which to render.
