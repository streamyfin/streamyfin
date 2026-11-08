# Window dimensions

Render-time layout reads in components and screens go through
`useWindowDimensions`, never `Dimensions.get("window")`. The hook re-renders when
the window changes (rotation, iPad multitasking, foldables, font scale);
`Dimensions.get` is a snapshot that goes stale silently. This applies on mobile
and TV alike — TV code shares components and screens with mobile, so the rule is
uniform even where a resize cannot happen. A callback that runs later (event
handler, timeout) may instead read `Dimensions.get` at invocation time — see the
exception below.

```typescript
import { useWindowDimensions } from "react-native";

const { width: windowWidth } = useWindowDimensions();
const { width: windowWidth, height: windowHeight } = useWindowDimensions();
```

The canonical names are `windowWidth` and `windowHeight`. Derive per-render values
from them (`const artworkSize = windowWidth * 0.5`), and list them in `useMemo` /
`useEffect` deps like any other reactive value. A `useMemo` keyed on `windowWidth`
is correct; caching the dimension itself, or a derivation whose deps omit it, is not.

## What not to do

- No module-scope snapshots: `const { width: SCREEN_WIDTH } = Dimensions.get("window")`
  captures the launch-time value forever.
- Do not bake `Dimensions.get` results into `StyleSheet.create` or constants computed
  once at import time.

`utils/scaleSize.ts` is a known exception in progress: it snapshots the window at
module load to scale TV sizes. It is shared infrastructure, not a pattern to copy —
don't call `Dimensions.get` in new code because scaleSize does.

## When `Dimensions.get` is still right

Outside React — utility functions, Jotai atom reads, event handlers defined outside
components, `hooks/useOrientation.ts` — a hook cannot run. There, call
`Dimensions.get("window")` at the point of use so every call sees the current value.
`Dimensions.get("screen")` stays allowed anywhere: the plugin guards `window` only,
and `screen` (the full display, system bars included) is a different measurement.
It is still a snapshot; for reactive screen layout in React, subscribe to
`Dimensions` changes as described in `docs/research/dimensions-vs-usewindowdimensions.md`.

## Enforcement

`biome-plugins/no-dimensions-window-in-ui.grit` errors on `Dimensions.get("window")`
in `app/**/*.tsx` and `components/**/*.tsx`. It cannot tell a component from a helper
inside a `.tsx` file; for a legitimate one-shot read in a `.tsx` file — an
imperative helper or event handler that needs the value when it runs, not a layout
value — suppress it with a reason:

```typescript
const handleReport = () => {
  // biome-ignore lint/plugin: read current window width when this event handler runs
  trackEvent({ windowWidth: Dimensions.get("window").width });
};
```

Details and platform behaviour: `docs/research/dimensions-vs-usewindowdimensions.md`.
