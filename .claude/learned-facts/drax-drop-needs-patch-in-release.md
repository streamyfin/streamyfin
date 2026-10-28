# A drax Drop Does Not Reorder in a Release Build Without Our Patch

**Date**: 2026-10-28
**Category**: native-modules
**Key files**: `patches/react-native-drax@1.1.0.patch`, `patches/react-native-drax.test.ts`, `components/common/DraggableQueueList.tsx`, `node_modules/react-native-drax/src/hooks/useCallbackDispatch.tsx`

## Detail

With react-native-drax 1.1.0 and Gesture Handler 3, dragging a queue row in a release build opens the gap where the row would land, then springs the row back on release: `onReorder` never runs. A debug build reorders, so the bug only shows on a production build. Two bugs in drax cause it, and `patches/react-native-drax@1.1.0.patch` fixes both, in `src` (what Metro bundles) and `lib/module` (what Jest loads):

- Since 3.0.0-beta.3, Gesture Handler calls `onDeactivate` and `onFinalize` with the event alone and reports a cancellation as `event.canceled` (software-mansion/react-native-gesture-handler#3887). drax's v3 path hands its `onFinalize(event, didSucceed)` straight to `usePanGesture`, so `didSucceed` is `undefined` and every drop also runs drax's drag end as a cancel. Logged on the device as two `onDragEnd` calls per drop, the second with `cancelled: true`.
- `SortableItem` destructured `onItemSnapEnd` from `sortable._internal` while rendering. `SortableContainer` only sets it in a `useLayoutEffect`, after its items rendered, so an item that does not render again keeps `undefined`. The snap animation ends (`finished` is true), drax calls the item's `onSnapEnd`, and nothing reaches `finalizeDrag`, the function that calls `onReorder`.

The same patch draws the row being dragged, on every build. drax's `HoverLayer` spread `StyleSheet.absoluteFillObject` into its container style, and React Native no longer exports it (0.86 has `absoluteFill` only), so the spread added nothing: the layer lost its absolute position and sat below the list in its layout, at the size of its content, and the translation that follows the finger moved it out of the provider, where it was clipped. Only the gap where the row would land showed. drax's own state looked right throughout (phase `dragging`, a hover position under the finger, the row's measurements); the native view tree taken during a held drag (`adb shell dumpsys activity top`) showed the layer below the list. The patch spreads `StyleSheet.absoluteFill` instead.

How it was found: logs added to drax in `node_modules` on a release build (`console.log` reaches logcat under `ReactNativeJS` in release), from the snapback start to `finalizeDrag`. Disabling the worklets' bytecode compilation (`hermesBytecode` in `babel.config.js`) changed nothing, which ruled the build pipeline out.

Two traps on the way: Gradle does not rebuild the release JS bundle when only a file in `node_modules` changed, so delete `android/app/build/generated/assets` before rebuilding a test; and `adb shell input swipe` reads as a scroll to drax, so drag with `input motionevent DOWN`, a series of `MOVE`, then `UP`.

Drop the patch only once a drax release fixes all three: the spec in `patches/` must pass against that version with the patch removed.
