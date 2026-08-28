# Platform-Specific File Suffix (.tv.tsx) Is Not A Resolution Mechanism

**Date**: 2026-01-26, corrected 2026-08-26
**Category**: tv
**Key files**: `metro.config.js`, `components/ItemContent.tsx`

## Detail

Metro maps `.tv.<ext>` ahead of the plain extension, but only when `EXPO_TV=1`
(`metro.config.js`). Any build without that variable resolves the plain file instead, and
the TV variant silently disappears, which is why relying on the suffix alone has burned us
before.

So the suffix is a naming label, never the mechanism. Pick the TV implementation
explicitly: for a page, check `Platform.isTV` at the top and return the TV component; for a
component, keep the variants in separate files and require the TV one behind the same
check, as `components/ItemContent.tsx` does with
`Platform.isTV ? require("./ItemContent.tv").ItemContentTV : null`.

Both naming styles are in the tree: `MyComponent.tv.tsx` and `TVMyComponent.tsx`.
