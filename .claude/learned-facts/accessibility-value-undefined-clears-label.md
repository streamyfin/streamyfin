# An Undefined accessibilityValue Clears the Label on Android

**Date**: 2026-11-03
**Category**: ui
**Key files**: `components/cast/OutputButton.tsx`,
`node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/BaseViewManager.java`

## Detail

On Android, React Native builds a view's content description from its
`accessibilityLabel` and `accessibilityValue.text`. When `accessibilityValue`
turns back to `undefined`, `BaseViewManager.setAccessibilityValue` receives
`null` and calls `view.setContentDescription(null)`: the label goes with it. It
comes back only when a later prop update rebuilds the description, such as a
new label or a value with a text. Meanwhile TalkBack and test tools fall back
to the children's text, which for an icon button is the glyph's private-use
character.

A value absent from the first render does no harm, since the prop is never
sent. The damage comes from toggling between an object and `undefined`, as in
`accessibilityValue={connected ? { text: "Connected" } : undefined}`. Keep the
value an object with a `text` in every state. Android then reads "label,
value", so a Maestro selector on the label alone needs a prefix match
(`"Cast button.*"`).

## Symptom pattern

A button that a flow or TalkBack finds by its name on a fresh launch is found
only by an icon character after some state change: in Maestro's hierarchy its
`accessibilityText` is ``. The header Cast button lost "Cast button"
after one connect and disconnect.
