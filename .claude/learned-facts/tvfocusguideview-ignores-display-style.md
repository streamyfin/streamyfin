# TVFocusGuideView Ignores `display` In Its Style

**Date**: 2026-10-09
**Category**: tv
**Key files**: `node_modules/react-native/Libraries/Components/TV/TVFocusGuideView.js`

## Detail

`TVFocusGuideView` builds its style as `[styles.container, props.style,
{ display: enabled ? "flex" : "none" }]`. Its own `display` comes last, so a
`display: "none"` passed in `style` is overwritten and the guide stays on
screen with all its children. Hide a guide with `enabled={false}`.

Found on the TV library page: the filter bar was meant to be hidden on the
Collections and Playlists tabs and was drawn on every tab.

## Symptom pattern

A focus guide that should be hidden is visible and focusable, with no warning.
A plain `View` with the same style hides as expected.
