# A Shared Value Written From JS Is Not There for the Next JS Read

**Date**: 2026-10-05
**Category**: state-and-data
**Key files**: `app/(auth)/player/direct-player.tsx`, `test-utils/reanimated.ts`, `node_modules/react-native-reanimated/src/mutables.ts`

## Detail

On the JS thread, setting a Reanimated shared value (`sv.value = x`, `sv.set(x)`) does not change what the next read returns. In Reanimated 4.5 (`mutableGuestDecorator` in `mutables.ts`) the setter is `scheduleOnUI(...)`: the write is queued in a microtask and applied when the UI thread gets to it. The getter is a synchronous read of what the UI runtime holds. So a read in the same handler returns the old value, and so does a read in the next handler when handlers run back to back, which is what happens to events queued behind a busy JS thread.

The JS player kept the time of its last progress report, the time of its last route write and its "a seek just ended" mark in shared values, written by one `onProgress` tick and read by the next. With ticks queued behind a stall, every one of them read the value from before the first, so each reported progress and called `router.setParams`. This was found by reading the library, from bursts of 14 to 24 progress reports and 15 to 18 `SET_PARAMS` within milliseconds in the breadcrumbs of one Android session (Sentry REACT-NATIVE-A7 and REACT-NATIVE-81). It has not been reproduced on a device.

State that only the JS thread reads and writes belongs in a `useRef`. A shared value is for what a worklet reads or animates. To tell the JS thread about something that happened on the UI thread, call a JS function through `runOnJS` and let it set a ref.

`test-utils/reanimated.ts` lands a write at once by default, which hides this. A spec for code that reads a shared value it also writes from JS should wrap the calls in `holdSharedValueWrites()` and `releaseSharedValueWrites()`.

The page still reads two shared values on the JS thread that are written from JS: `isSeeking` (set by the slider) and `progress` (written by `onProgress`, read back by the report built in the same call). Neither is a throttle, and both were left as they are.
