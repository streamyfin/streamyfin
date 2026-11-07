# `Dimensions.get('window')` vs `useWindowDimensions` - Research Document

## Question

When should code use `Dimensions.get('window')` and when should it use
`useWindowDimensions`, as of 2026 (React Native 0.88 docs, `react-native-tvos`
0.86.0-2 in this repo)? What happens on TV, rotation, and window resizing, and
what are the exceptions for non-component code?

## Short Answer

`useWindowDimensions` is the preferred API inside React components — the docs
and the `Dimensions.get` docblock both say so. It is a thin hook over
`Dimensions.get('window')` plus a `change` listener, so it re-renders when the
window size, scale, or font scale changes. `Dimensions.get` is a synchronous
snapshot; anything that caches its result (module-scope constants,
`StyleSheet.create`, a `useRef` snapshot, Jotai atoms read once) goes stale on
rotation, multitasking resize, foldables, and font-scale changes. A `useMemo`
keyed on the hook's `windowWidth` is fine — it recomputes when the value does.

Use `Dimensions.get` when a hook is not allowed: outside components/hooks,
inside callbacks, in utilities, and in class components. Call it at the point
of use — never cache the returned object or its destructured fields.

On TV (react-native-tvos), `didUpdateDimensions` effectively never fires for
size changes: the fork compiles out every frame/orientation observer under
`#if !TARGET_OS_TV`, leaving only the accessibility font-scale notification.
tvOS windows never resize or rotate, so this is harmless in practice — stale
reads cannot be observed. The guards are a fork addition; upstream
`facebook/react-native` 0.86 has none.

---

## How `useWindowDimensions` works

`Libraries/Utilities/useWindowDimensions.js` (identical upstream and in
react-native-tvos 0.86.0-2):

```js
const [dimensions, setDimensions] = useState(() => Dimensions.get('window'));
useEffect(() => {
  function handleChange({window}) {
    if (/* width, height, scale, or fontScale differ */) {
      setDimensions(window);
    }
  }
  const subscription = Dimensions.addEventListener('change', handleChange);
  // Re-sync: an update between the render-time `get` and the effect-time
  // listener subscription would otherwise be missed.
  handleChange({window: Dimensions.get('window')});
  return () => subscription.remove();
}, [dimensions]);
return dimensions;
```

- Returns `DisplayMetrics` (`{width, height, scale, fontScale}`) of the app
  **window**, not the screen. There is no `useScreenDimensions` equivalent.
- The effect depends on `dimensions`, so the listener re-subscribes after each
  change.
- The post-subscribe `handleChange` call closes the missed-update race
  (commented in source).

Sources: [useWindowDimensions.js (main)](https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/Utilities/useWindowDimensions.js),
[useWindowDimensions docs](https://reactnative.dev/docs/usewindowdimensions)

---

## How `Dimensions` works

`Libraries/Utilities/Dimensions.js`:

- `Dimensions.set(NativeDeviceInfo.getConstants().Dimensions)` runs at module
  load, seeded from native constants, so `get` is synchronous and available
  before `runApplication`.
- JS subscribes to the native `didUpdateDimensions` device event; each event
  calls `Dimensions.set`, which **replaces** the whole `{window, screen}`
  object and emits `'change'` to JS listeners.
- `get(dim)` returns `dimensions[dim]` and throws an invariant
  (`No dimension set for key ...`) for unknown keys.
- Because `set` replaces the object rather than mutating it, a cached reference
  (or destructured `width`/`height`) is permanently stale after the first
  change event.
- Android sends `windowPhysicalPixels`/`screenPhysicalPixels`; JS divides by
  `scale` itself to avoid bridge precision loss.
- `ScaledSize` is `@deprecated` in favor of `DisplayMetrics`.

Sources: [Dimensions.js (v0.86.0)](https://github.com/facebook/react-native/blob/v0.86.0/packages/react-native/Libraries/Utilities/Dimensions.js),
[Dimensions docs](https://reactnative.dev/docs/dimensions)

---

## When `didUpdateDimensions` fires, per platform

### iOS (`RCTDeviceInfo.mm`)

Native observers that emit `didUpdateDimensions` (upstream 0.86 and the tvOS
fork behave identically on iOS):

- `UIDeviceOrientationDidChangeNotification` → `interfaceOrientationDidChange`
  — fires only on a real portrait↔landscape switch or a fullscreen-state change
  (Split View enter/exit), and only while the app is active.
- Key-window `frame` KVO and `UIApplicationDidBecomeActiveNotification` /
  `RCTUserInterfaceStyleDidChangeNotification` → `interfaceFrameDidChange` —
  catches Stage Manager / freeform resizes; dedupes against the last exported
  dimensions.
- `RCTAccessibilityManagerDidUpdateMultiplierNotification` →
  `didReceiveNewContentSizeMultiplier` — font-scale (Dynamic Type) changes.

`window` = key-window bounds; `screen` = `UIScreen.mainScreen.bounds`. They
diverge under iPad multitasking. If no key window exists, `window` falls back
to screen size.

### tvOS (react-native-tvos fork only)

The fork wraps all frame/orientation observers in `#if !TARGET_OS_TV`
(`RCTDeviceInfo.mm` lines 68, 95, 263–324): the `frame` KVO handler, the
orientation and frame-change notification registrations, and both
`interfaceOrientationDidChange`/`interfaceFrameDidChange` methods are compiled
out. Upstream `facebook/react-native` has no such guards — this is a deliberate
fork diff.

Only `didReceiveNewContentSizeMultiplier` (font scale) still emits
`didUpdateDimensions`. Since a tvOS app window is always the full screen and
never rotates, width/height changes cannot occur anyway; a tvOS "rotation bug"
from a cached `Dimensions.get` cannot be observed under the current fork.
Treat that as an implementation fact about `react-native-tvos` 0.86.0-2, not
guaranteed tvOS API behavior — a future fork release could restore the
emitters, and nothing upstream documents this exemption.

### Android (`DeviceInfoModule.kt`, `ReactRootView.java`)

- `ReactRootView`'s layout listener calls `checkForDeviceDimensionsChanges()`
  on every layout pass, which calls `DeviceInfoModule.emitUpdateDimensionsEvent()`;
  the module dedupes against the previously emitted metrics.
- `onHostResume` re-reads `fontScale` and emits if it changed.
- `window` uses `WindowMetricsCalculator.computeCurrentWindowMetrics` bounds.
  When edge-to-edge is off, system bars and display-cutout insets are
  subtracted — matching the docs note that Android `window` excludes the
  status bar (if not translucent) and bottom navigation bar. `screen` uses
  `DisplayMetricsHolder` real metrics, so `window` ≠ `screen` on Android in the
  common case, unlike iOS full-screen.

Sources: [RCTDeviceInfo.mm upstream v0.86.0](https://github.com/facebook/react-native/blob/v0.86.0/packages/react-native/React/CoreModules/RCTDeviceInfo.mm),
[RCTDeviceInfo.mm react-native-tvos v0.86.0-2](https://github.com/react-native-tvos/react-native-tvos/blob/v0.86.0-2/packages/react-native/React/CoreModules/RCTDeviceInfo.mm),
[DeviceInfoModule.kt (installed react-native-tvos 0.86.0-2)](https://github.com/react-native-tvos/react-native-tvos/tree/v0.86.0-2/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/deviceinfo/DeviceInfoModule.kt),
[Dimensions docs](https://reactnative.dev/docs/dimensions)

---

## Decision rules

| Context | Use |
| --- | --- |
| Function component / custom hook render | `useWindowDimensions()` |
| Class component | `Dimensions.get('window')` in `render()`, or wrap in a function component; subscribe with `addEventListener` if it must react to changes |
| Event handler, callback, utility function, Jotai atom read, service | `Dimensions.get('window')` at call time — it re-reads the latest native-pushed value |
| Long-lived non-React subscriber that must react to changes | `Dimensions.addEventListener('change', cb)` → `EventSubscription`; call `.remove()` on cleanup |
| Anything once-computed | Never: no module-scope `const {width} = ...`, no `StyleSheet.create` baked from dimensions, no `useRef` snapshots. A `useMemo` that lists `windowWidth` in its deps recomputes on change and is valid; one that omits it is the same stale-cache bug. Compute per render (inline styles) or per call otherwise. |
| Need screen size / no-system-bars size | `Dimensions.get('screen')` — there is no hook for it |
| TV code | Either API works; in practice values never change on tvOS, but `useWindowDimensions` keeps the code correct if reused on mobile builds |

## Edge cases and caveats

- **`window` vs `screen`**: on iOS they are equal in full-screen but diverge
  under Split View/Stage Manager; on Android `window` excludes system bars (in
  non-edge-to-edge mode) while `screen` is the real display size. Most layout
  code wants `window`.
- **`Dimensions.get` throws** for unknown keys — only `window` and `screen`
  are ever set.
- **`fontScale` is part of the payload.** `useWindowDimensions` re-renders on
  Dynamic Type / font-size changes too, which is the intended way to adapt
  layout to accessibility text sizes.
- **First `set` does not emit `change`** — listeners attached later still see
  current values via `get`.
- **The stale-cache failure mode is silent.** `Dimensions.get` never warns; a
  module-scope `const {width} = Dimensions.get('window')` simply returns the
  launch-time value forever after rotation — the bug only shows on rotation,
  foldables, iPad multitasking, or Android window resizing, i.e. usually in QA
  or production.
- **tvOS is the exception that proves the rule.** Because the fork removes the
  native emitters, `Dimensions.addEventListener('change')` on tvOS will not
  fire for anything except accessibility multiplier changes; do not build TV
  logic that waits on it.

## Sources

- https://reactnative.dev/docs/dimensions (docs, "useWindowDimensions is the preferred API for React components")
- https://reactnative.dev/docs/usewindowdimensions
- https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/Utilities/useWindowDimensions.js
- https://github.com/facebook/react-native/blob/v0.86.0/packages/react-native/Libraries/Utilities/Dimensions.js
- https://github.com/facebook/react-native/blob/v0.86.0/packages/react-native/React/CoreModules/RCTDeviceInfo.mm
- https://github.com/react-native-tvos/react-native-tvos/blob/v0.86.0-2/packages/react-native/React/CoreModules/RCTDeviceInfo.mm
- Installed source verified in this repo: `node_modules/react-native/Libraries/Utilities/{Dimensions,useWindowDimensions}.js`,
  `node_modules/react-native/React/CoreModules/RCTDeviceInfo.mm`,
  `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/deviceinfo/DeviceInfoModule.kt`,
  `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/ReactRootView.java`
  (`react-native` resolves to `npm:react-native-tvos@0.86.0-2` per `package.json`)
