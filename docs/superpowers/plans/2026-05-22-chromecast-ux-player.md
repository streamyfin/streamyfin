# Chromecast Player UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the trickplay/scrub-bubble positioning on both casting progress bars, share the bubble in one component, lighten the time display, add a mini-player stop button, and add a developer touch-zone overlay.

**Architecture:** A shared `CastTrickplayBubble` component renders the scrub preview; both sliders feed it via `renderBubble` and set `bubbleWidth` so `react-native-awesome-slider` clamps the bubble itself (no manual positioning). A `DEBUG_TOUCH_ZONES` flag draws red hit-area outlines for hand-calibration.

**Tech Stack:** TypeScript (strict), React Native / Expo, `react-native-awesome-slider`, `expo-image`.

**Spec:** `docs/superpowers/specs/2026-05-22-chromecast-ux-player-design.md`

**Environment note:** Windows checkout, `core.autocrlf=true` — project-wide `bun run check` reports ~124 pre-existing CRLF errors, unrelated. Gate: `bun run typecheck` (fully green) + Biome on edited files.

**Commit note:** Do NOT add a `Co-Authored-By` trailer to commit messages.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `components/casting/player/CastTrickplayBubble.tsx` | Shared scrub-preview bubble (trickplay tile or plain time text) | 1 |
| `utils/casting/debug.ts` | `DEBUG_TOUCH_ZONES` flag | 4 |
| `components/casting/player/CastPlayerProgressBar.tsx` | Use the shared bubble + `bubbleWidth`; drop manual positioning; debug overlay | 2, 4 |
| `components/casting/CastingMiniPlayer.tsx` | Same bubble fix; add a stop button | 3 |
| `app/(auth)/casting-player.tsx` | Drop the now-dead `scrubPercentage` plumbing | 2 |
| `hooks/useCastPlayerProgress.ts` | Drop the now-dead `scrubPercentage` state/return | 2 |

---

## Task 1: Shared `CastTrickplayBubble` component

**Files:**
- Create: `components/casting/player/CastTrickplayBubble.tsx`

- [ ] **Step 1: Create the component**

Create `components/casting/player/CastTrickplayBubble.tsx`:

```tsx
/**
 * Shared scrub-preview bubble for the casting progress bars.
 *
 * Renders the trickplay tile (when trickplay data is available) with the scrub
 * time as plain text above it, or just the scrub time as plain text. It does NO
 * positioning of its own — the slider places it via its `bubbleWidth` prop.
 */

import { Image } from "expo-image";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import type { useTrickplay } from "@/hooks/useTrickplay";
import { formatTrickplayTime } from "@/utils/casting/helpers";

type TrickplayReturn = ReturnType<typeof useTrickplay>;

interface CastTrickplayBubbleProps {
  /** Current trickplay image URL/coordinates, or null. */
  trickPlayUrl: TrickplayReturn["trickPlayUrl"];
  /** Parsed trickplay metadata, or null. */
  trickplayInfo: TrickplayReturn["trickplayInfo"];
  /** Scrub time to display. */
  trickplayTime: { hours: number; minutes: number; seconds: number };
  /** Trickplay tile width in px (220 main player, 140 mini-player). */
  tileWidth: number;
}

export function CastTrickplayBubble({
  trickPlayUrl,
  trickplayInfo,
  trickplayTime,
  tileWidth,
}: CastTrickplayBubbleProps) {
  const timeText = (
    <Text
      style={{
        color: "#fff",
        fontSize: 13,
        fontWeight: "600",
        textAlign: "center",
        textShadowColor: "rgba(0, 0, 0, 0.85)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      }}
    >
      {formatTrickplayTime(trickplayTime)}
    </Text>
  );

  // No trickplay: just the plain time text.
  if (!trickPlayUrl || !trickplayInfo) {
    return timeText;
  }

  const { x, y, url } = trickPlayUrl;
  const tileHeight = tileWidth / (trickplayInfo.aspectRatio ?? 1.78);

  return (
    <View style={{ width: tileWidth, alignItems: "center", gap: 4 }}>
      {timeText}
      <View
        style={{
          width: tileWidth,
          height: tileHeight,
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
        }}
      >
        <Image
          cachePolicy='memory-disk'
          style={{
            width: tileWidth * (trickplayInfo.data?.TileWidth ?? 1),
            height: tileHeight * (trickplayInfo.data?.TileHeight ?? 1),
            transform: [
              { translateX: -x * tileWidth },
              { translateY: -y * tileHeight },
            ],
          }}
          source={{ uri: url }}
          contentFit='cover'
        />
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `bun run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add components/casting/player/CastTrickplayBubble.tsx
git commit -m "feat(casting): add shared CastTrickplayBubble component"
```

---

## Task 2: Rework `CastPlayerProgressBar`

**Files:**
- Modify: `components/casting/player/CastPlayerProgressBar.tsx`
- Modify: `app/(auth)/casting-player.tsx`
- Modify: `hooks/useCastPlayerProgress.ts`

- [ ] **Step 1: Rework the slider in `CastPlayerProgressBar.tsx`**

Read `components/casting/player/CastPlayerProgressBar.tsx`. Make these changes:

**(a)** Replace the entire `renderBubble={() => { ... }}` prop (the ~125-line callback that builds the bubble with manual `position: "absolute"` / `left` / `thumbPosition` maths) with:

```tsx
          renderBubble={() => (
            <CastTrickplayBubble
              trickPlayUrl={trickPlayUrl}
              trickplayInfo={trickplayInfo}
              trickplayTime={trickplayTime}
              tileWidth={220}
            />
          )}
          bubbleWidth={trickPlayUrl && trickplayInfo ? 220 : 64}
```

(`bubbleWidth` tells the slider to clamp the bubble within the track; 220 = trickplay tile width, 64 = plain time-text width.)

**(b)** Reduce `panHitSlop` to a sane default that does not overlap the controls above the bar — change it to:

```tsx
          panHitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
```

(The exact values will be hand-calibrated by the user with the Task 4 overlay.)

**(c)** `scrubPercentage` was only used by the deleted manual positioning. Remove `scrubPercentage` and `setScrubPercentage` from `CastPlayerProgressBarProps` and the destructured params, and remove the `setScrubPercentage(...)` call inside `onValueChange` (keep the rest of `onValueChange` — the `calculateTrickplayUrl` and `setTrickplayTime` logic).

**(d)** Add the import `import { CastTrickplayBubble } from "@/components/casting/player/CastTrickplayBubble";`. Remove now-unused imports: `Image` (`expo-image`), `Dimensions`, `formatTrickplayTime`. Keep `Text`, `View`, `formatTime`, `calculateEndingTime`, `msToTicks`, `ticksToSeconds` — still used by the static time row and `onValueChange`.

**(e)** The static current/ending/total time row at the bottom is unchanged.

- [ ] **Step 2: Remove the dead `scrubPercentage` plumbing**

In `app/(auth)/casting-player.tsx`: the `<CastPlayerProgressBar .../>` element passes `scrubPercentage` and `setScrubPercentage` props — remove those two props from the element.

In `hooks/useCastPlayerProgress.ts`: remove the `scrubPercentage` / `setScrubPercentage` state and their entries in the hook's return object and return-type interface. (If `scrubPercentage` turns out to be read somewhere else, leave it and report — but the only consumer was `CastPlayerProgressBar`'s manual positioning.)

- [ ] **Step 3: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Run: `bunx biome check components/casting/player/CastPlayerProgressBar.tsx "app/(auth)/casting-player.tsx" hooks/useCastPlayerProgress.ts`
Expected: PASS on these files.

- [ ] **Step 4: Commit**

```bash
git add components/casting/player/CastPlayerProgressBar.tsx "app/(auth)/casting-player.tsx" hooks/useCastPlayerProgress.ts
git commit -m "fix(casting): clamp trickplay bubble via slider bubbleWidth"
```

---

## Task 3: Rework `CastingMiniPlayer`

**Files:**
- Modify: `components/casting/CastingMiniPlayer.tsx`

- [ ] **Step 1: Apply the same bubble fix**

Read `components/casting/CastingMiniPlayer.tsx`. Make these changes:

**(a)** Replace the entire `renderBubble={() => { ... }}` prop (the ~110-line manual-positioning callback) with:

```tsx
          renderBubble={() => (
            <CastTrickplayBubble
              trickPlayUrl={trickPlayUrl}
              trickplayInfo={trickplayInfo}
              trickplayTime={trickplayTime}
              tileWidth={140}
            />
          )}
          bubbleWidth={trickPlayUrl && trickplayInfo ? 140 : 60}
```

**(b)** `scrubPercentage` is local state here (`const [scrubPercentage, setScrubPercentage] = useState(0);`) used only by the deleted positioning maths. Remove that `useState` and the `setScrubPercentage(...)` call inside `onValueChange` (keep the `calculateTrickplayUrl` / `setTrickplayTime` logic).

**(c)** Add the import `import { CastTrickplayBubble } from "@/components/casting/player/CastTrickplayBubble";`. Remove now-unused imports: `Image` (only if no longer used — the mini-player still renders a poster `Image`, so keep `Image`), `Dimensions`, `formatTrickplayTime`. Verify each with a quick search before removing.

- [ ] **Step 2: Add the stop button**

In the mini-player's control area there is one button — the play/pause `Pressable` (icon `play`/`pause`). Add a **stop** button immediately before it (so the row reads: stop, play/pause), inside the same controls container:

```tsx
          {/* Stop button */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              remoteMediaClient?.stop()?.catch((error: unknown) => {
                console.error("[CastingMiniPlayer] Stop error:", error);
              });
            }}
            style={{ padding: 8 }}
          >
            <Ionicons name='stop' size={24} color='white' />
          </Pressable>
```

Once the media stops, `mediaStatus.playerState` becomes `IDLE` and the component already returns `null` (it hides itself). `e.stopPropagation()` prevents the row's "open player" press from also firing.

- [ ] **Step 3: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Run: `bunx biome check components/casting/CastingMiniPlayer.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/casting/CastingMiniPlayer.tsx
git commit -m "feat(casting): mini-player trickplay fix and stop button"
```

---

## Task 4: Touch-zone debug overlay

**Files:**
- Create: `utils/casting/debug.ts`
- Modify: `components/casting/player/CastPlayerProgressBar.tsx`
- Modify: `components/casting/player/CastPlayerEpisodeControls.tsx`

- [ ] **Step 1: Create the debug flag**

Create `utils/casting/debug.ts`:

```ts
/**
 * Developer flag for visualising touch zones in the casting player.
 *
 * Flip to `true` to draw red outlines over the slider hit area and the control
 * row, run the app, hand-calibrate `panHitSlop`, then flip back to `false`.
 * Gate every use with `__DEV__` so it can never render in a release build.
 */
export const DEBUG_TOUCH_ZONES = false;
```

- [ ] **Step 2: Draw the slider hit-zone overlay in `CastPlayerProgressBar.tsx`**

In `components/casting/player/CastPlayerProgressBar.tsx`, add the import:

```tsx
import { DEBUG_TOUCH_ZONES } from "@/utils/casting/debug";
```

The slider sits inside `<View style={{ marginTop: 8, height: 40 }}>`. The slider's
effective touch area is the slider plus its `panHitSlop`. Inside that container
`View`, after the `<Slider .../>`, add a debug overlay that traces the hit area —
use the *same* `panHitSlop` values the `Slider` is given so the box matches:

```tsx
        {__DEV__ && DEBUG_TOUCH_ZONES && (
          <View
            pointerEvents='none'
            style={{
              position: "absolute",
              top: -12,
              bottom: -12,
              left: -10,
              right: -10,
              borderWidth: 1,
              borderColor: "red",
            }}
          />
        )}
```

(The `top/bottom/left/right` offsets mirror the `panHitSlop` from Task 2 step 1b —
if `panHitSlop` is changed, change these to match so the overlay stays accurate.)

- [ ] **Step 3: Draw the control-row overlay in `CastPlayerEpisodeControls.tsx`**

In `components/casting/player/CastPlayerEpisodeControls.tsx`, add the import:

```tsx
import { DEBUG_TOUCH_ZONES } from "@/utils/casting/debug";
```

The component's root is a `<View>` (the absolute-positioned button row). As the
last child of that root `View`, add:

```tsx
      {__DEV__ && DEBUG_TOUCH_ZONES && (
        <View
          pointerEvents='none'
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            borderWidth: 1,
            borderColor: "lime",
          }}
        />
      )}
```

- [ ] **Step 4: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Temporarily set `DEBUG_TOUCH_ZONES` to `true`, run `bun run typecheck` again to
confirm both `__DEV__ && DEBUG_TOUCH_ZONES` branches still type-check, then set it
back to `false` before committing.

Run: `bunx biome check utils/casting/debug.ts components/casting/player/CastPlayerProgressBar.tsx components/casting/player/CastPlayerEpisodeControls.tsx`
Expected: PASS on these files.

- [ ] **Step 5: Commit**

```bash
git add utils/casting/debug.ts components/casting/player/CastPlayerProgressBar.tsx components/casting/player/CastPlayerEpisodeControls.tsx
git commit -m "feat(casting): add DEBUG_TOUCH_ZONES overlay for hit-area calibration"
```

---

## Final verification

- [ ] **Checks**

Run: `bun run typecheck` → PASS.
Run: `bun test utils/` → PASS (unchanged suites).

- [ ] **Manual verification** (Android emulator)

- Scrub the main progress bar to the far left and far right — the trickplay
  preview is never clipped at the screen edge and tracks the cursor; the time text
  is plain white, legible, above the preview.
- Same on the mini-player progress bar.
- The mini-player stop button stops playback and the mini-player disappears.
- The 4 episode-row buttons are tappable (no slider-slop overlap).
- Flip `DEBUG_TOUCH_ZONES` to `true`: red outline on the slider hit area, lime
  outline on the control row are visible — use them to confirm / hand-tune
  `panHitSlop`, then set the flag back to `false`.

---

## Notes for the implementer

- Line numbers drift — match on quoted code.
- This is UI work; there is no pure logic to unit-test. `bun run typecheck` per task
  plus the manual checks are the gate.
- Do NOT add a `Co-Authored-By` trailer to commit messages.
- The `renderBubble` blocks in `CastPlayerProgressBar.tsx` and `CastingMiniPlayer.tsx`
  are near-identical today — both are replaced by the shared `CastTrickplayBubble`.
- Out of scope: the custom receiver, the queued feature ideas.
