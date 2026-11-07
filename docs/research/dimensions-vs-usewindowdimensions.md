# Window dimensions: React Native 0.86 research snapshot

These findings are based on React Native 0.86.0 and react-native-tvos 0.86.0-2.

`useWindowDimensions` is the preferred API inside React components — the docs
and the `Dimensions.get` docblock both say so. It is a thin hook over
`Dimensions.get('window')` plus a `change` listener, so it re-renders when the
window size, scale, or font scale changes. `Dimensions.get` is a synchronous
snapshot; anything that caches its result (module-scope constants,
`StyleSheet.create`, a `useRef` snapshot, Jotai atoms read once) goes stale on
rotation, multitasking resize, foldables, and font-scale changes. A `useMemo`
keyed on `windowWidth` is fine — it recomputes when the value does.

Use `Dimensions.get` where a hook cannot run: outside components/hooks, inside
callbacks, in utilities, in class components. Call it at the point of use —
do not cache the returned object or its destructured fields.

In the fork version examined here, `didUpdateDimensions` does not fire on tvOS
for window-size changes: every frame/orientation observer is compiled out under
`#if !TARGET_OS_TV`, leaving only the accessibility font-scale notification.
Cached width/height cannot go stale on that fork because tvOS keeps the app
window full-screen; a cached `fontScale` still can, since font-scale events do
fire. Upstream `facebook/react-native` 0.86 has no such guards.

---

## How `useWindowDimensions` works

`Libraries/Utilities/useWindowDimensions.js` (identical in upstream 0.86.0 and
in the examined fork):

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
  window, not the screen. React Native 0.86 has no `useScreenDimensions` hook.
- The effect depends on `dimensions`, so the listener re-subscribes after each
  change.
- The post-subscribe `handleChange` call closes the missed-update race
  (commented in source).

---

## How `Dimensions` works

`Libraries/Utilities/Dimensions.js`:

- `Dimensions.set(NativeDeviceInfo.getConstants().Dimensions)` runs at module
  load, seeded from native constants, so `get` is synchronous and available
  before `runApplication`.
- JS subscribes to the native `didUpdateDimensions` device event; each event
  calls `Dimensions.set`, which replaces the whole `{window, screen}` object
  and emits `'change'` to JS listeners.
- `get(dim)` returns `dimensions[dim]` and throws an invariant
  (`No dimension set for key ...`) for unknown keys.
- Because `set` replaces the object rather than mutating it, a cached reference
  (or destructured `width`/`height`) is stale after the first change event.
- Android sends `windowPhysicalPixels`/`screenPhysicalPixels`; JS divides by
  `scale` itself to avoid bridge precision loss.
- `ScaledSize` is `@deprecated` in favor of `DisplayMetrics`.

---

## When `didUpdateDimensions` fires, per platform

### iOS (`RCTDeviceInfo.mm`)

Native observers that emit `didUpdateDimensions` (upstream 0.86 and the
examined fork behave identically on iOS):

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

### tvOS (react-native-tvos 0.86.0-2)

The fork wraps all frame/orientation observers in `#if !TARGET_OS_TV`
(`RCTDeviceInfo.mm` lines 68, 95, 263–324): the `frame` KVO handler, the
orientation and frame-change notification registrations, and both
`interfaceOrientationDidChange`/`interfaceFrameDidChange` methods are compiled
out. Upstream `facebook/react-native` has no such guards — this is a deliberate
fork diff.

Only `didReceiveNewContentSizeMultiplier` (font scale) still emits
`didUpdateDimensions`. Because the app window is always full-screen on tvOS,
width/height updates cannot occur in this fork, so a cached size cannot go
stale there; a cached `fontScale` can. This is an implementation fact about
the fork version examined here, not a documented tvOS API guarantee — a later
fork release could restore the emitters.

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

---

## Decision rules

| Context | Use |
| --- | --- |
| Function component / custom hook render | `useWindowDimensions()` |
| Class component | `Dimensions.get('window')` in `render()`, or wrap in a function component; subscribe with `addEventListener` if it must react to changes |
| Event handler, callback, utility function, Jotai atom read, service | `Dimensions.get('window')` at call time — it re-reads the latest native-pushed value |
| Long-lived non-React subscriber that must react to changes | `Dimensions.addEventListener('change', cb)` → `EventSubscription`; call `.remove()` on cleanup |
| Anything once-computed | Do not cache: no module-scope `const {width} = ...`, no `StyleSheet.create` baked from dimensions, no `useRef` snapshots. A `useMemo` that lists `windowWidth` in its deps recomputes on change and is valid; one that omits it is the same stale-cache bug. Compute per render (inline styles) or per call otherwise. |
| Need screen size / no-system-bars size | `Dimensions.get('screen')` — React Native 0.86 has no screen-dimensions hook |
| TV UI | Use `useWindowDimensions()`. In the fork version examined here, tvOS does not emit window-size updates; `fontScale` can still change. Android TV uses the Android path. |

## Edge cases and caveats

- `window` vs `screen`: on iOS they are equal in full-screen but diverge under
  Split View/Stage Manager; on Android `window` excludes system bars (in
  non-edge-to-edge mode) while `screen` is the real display size. Most layout
  code wants `window`.
- `Dimensions.get` throws for unknown keys — only `window` and `screen` are
  ever set.
- `fontScale` is part of the payload. `useWindowDimensions` re-renders on
  Dynamic Type / font-size changes too, which is the intended way to adapt
  layout to accessibility text sizes.
- First `set` does not emit `change` — listeners attached later still see
  current values via `get`.
- Stale caches fail quietly. `Dimensions.get` does not warn; a module-scope
  `const {width} = Dimensions.get('window')` keeps returning the launch-time
  value after rotation — the bug surfaces only on rotation, foldables, iPad
  multitasking, or Android window resizing, usually in QA or production.
- On the examined tvOS fork, `Dimensions.addEventListener('change')` fires
  only for accessibility multiplier changes, so TV logic cannot rely on it for
  size updates.

## Sources

- https://reactnative.dev/docs/0.86/dimensions ("useWindowDimensions is the preferred API for React components"; Android `window` excludes system bars)
- https://reactnative.dev/docs/0.86/usewindowdimensions
- https://github.com/facebook/react-native/blob/v0.86.0/packages/react-native/Libraries/Utilities/useWindowDimensions.js
- https://github.com/facebook/react-native/blob/v0.86.0/packages/react-native/Libraries/Utilities/Dimensions.js
- https://github.com/facebook/react-native/blob/v0.86.0/packages/react-native/React/CoreModules/RCTDeviceInfo.mm
- https://github.com/react-native-tvos/react-native-tvos/blob/v0.86.0-2/packages/react-native/React/CoreModules/RCTDeviceInfo.mm
- https://github.com/react-native-tvos/react-native-tvos/blob/v0.86.0-2/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/deviceinfo/DeviceInfoModule.kt (react-native-tvos v0.86.0-2)
- https://github.com/react-native-tvos/react-native-tvos/blob/v0.86.0-2/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/ReactRootView.java (react-native-tvos v0.86.0-2)
