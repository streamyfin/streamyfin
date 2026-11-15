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

const { width: windowWidth, height: windowHeight } = useWindowDimensions();
```

The canonical names are `windowWidth` and `windowHeight`. Derive per-render values
from them (`const columns = windowWidth < 600 ? 3 : 5`), and list them in `useMemo` /
`useEffect` deps like any other reactive value. A `useMemo` keyed on `windowWidth`
is correct; caching the dimension itself, or a derivation whose deps omit it, is not.

A square sized on the window, artwork for one, goes through `squareArtworkSide`
(`utils/artworkSize.ts`). It takes the window's short side: sized on the width, a
phone turned to landscape got a square far taller than the window. The square fits
the window now, but what a page puts under it can still be a scroll away in
landscape: on the now playing screen the title and controls start just below it.

## What not to do

- No module-scope snapshots: `const { width: SCREEN_WIDTH } = Dimensions.get("window")`
  captures the launch-time value forever.
- Do not bake `Dimensions.get` results into `StyleSheet.create` or constants computed
  once at import time.

`utils/scaleSize.ts` is a known exception in progress: it snapshots the window at
module load to scale TV sizes. It is shared infrastructure, not a pattern to copy —
don't call `Dimensions.get` in new code because scaleSize does.

## When `Dimensions.get` is still right

Outside React (utility functions, Jotai atom reads, event handlers defined outside
components) a hook cannot run. There, call `Dimensions.get("window")` at the point of
use so every call sees the current value. `hooks/useOrientation.ts` is a hook, but it
reads the window once, for its first orientation before the native module has one to
report, and says so in its suppression.
`Dimensions.get("screen")` stays allowed anywhere: the plugin guards `window` only,
and `screen` (the full display, system bars included) is a different measurement.
It is still a snapshot; for reactive screen layout in React, subscribe to
`Dimensions` changes as described in `docs/research/dimensions-vs-usewindowdimensions.md`.

## Enforcement

`biome-plugins/no-dimensions-window-in-ui.grit` errors on `Dimensions.get("window")`
in `app/`, `components/`, `hooks/` and `providers/`, `.ts` and `.tsx` files alike.
Specs are left out: a spec may read the window it mocks to work out what it expects.
The rule cannot tell a component from a helper; for a legitimate one-shot read, an
imperative helper or an event handler that needs the value when it runs rather than a
layout value, suppress it with a reason:

```typescript
const handleReport = () => {
  // biome-ignore lint/plugin/no-dimensions-window-in-ui: read current window width when this event handler runs
  trackEvent({ windowWidth: Dimensions.get("window").width });
};
```

Name the plugin in the suppression. A bare `lint/plugin` silences every plugin on
that line, the TV font size rule included.

Details and platform behaviour: `docs/research/dimensions-vs-usewindowdimensions.md`.
