# A className On A Custom Component Arrives As style

**Date**: 2026-10-04
**Category**: ui
**Key files**: `components/common/ServerUrlStatusText.tsx`, `babel.config.js`

## Detail

The NativeWind 2 Babel plugin rewrites every JSX element that carries a
`className`, host component or not, into
`<StyledComponent className="..." component={X} />`. `StyledComponent`
resolves the classes and hands `X` a `style` prop. `X` never sees `className`.

A component that declares a `className` prop and splices it into the
`className` of what it renders therefore drops whatever its callers passed,
with no error: the prop is simply `undefined`. `ServerUrlStatusText` did this,
and the `mt-2`, `mt-1 px-4` of all three callers were never applied, which is
why the status line sat against the edge of the input above it.

Take `style` and forward it (or spread `...props` onto the root, the way
`ItemHeader` does). Keep `className` in the props type so callers type check.

## Symptom pattern

Spacing or colour passed as `className` to one of the app's own components has
no effect, while the same classes on a `View` or `Text` work. Jest shows it
too: `StyleSheet.flatten(node.props.style)` lacks the caller's values.
