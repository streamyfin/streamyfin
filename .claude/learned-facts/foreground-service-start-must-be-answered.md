# A Foreground Service Start Must Be Answered, Even When It Will Be Refused

**Date**: 2026-10-05
**Category**: native-modules
**Key files**: `modules/background-downloader/android/.../DownloadService.kt`,
`ForegroundPromotion.kt`, `ForegroundPromotionTest.kt`

## Detail

`Context.startForegroundService()` marks the service record as owing a
`startForeground()` call. The process is killed with
`ForegroundServiceDidNotStartInTimeException` when the service is brought down
with that debt open. Bringing it down is immediate: a `stopSelf()` in
`onStartCommand` is enough when nothing is bound yet. When the debt is still
open after the timeout (a few seconds) the system stops the service itself,
which is the same kill, unless a binding keeps the service alive: then it is
reported as an ANR with the same "did not then call Service.startForeground()"
text.

The debt is cleared inside `startForeground()` before the system checks whether
the promotion is allowed (`ActiveServices.setServiceForegroundInnerLocked`:
`r.fgRequired = false` comes ahead of the BOOT_COMPLETED, background start and
time limit checks). So a `startForeground()` that throws
`ForegroundServiceStartNotAllowedException` has still answered the start, and
catching it and stopping is safe. Skipping the call because it would probably
be refused is the one thing that is not.

That is how Sentry REACT-NATIVE-9V happened. `onStartCommand` guessed at a
BOOT_COMPLETED context from `SystemClock.elapsedRealtime() < 10 min` on Android
15+ and called `stopSelf()` without `startForeground()`. Any download started
within ten minutes of a reboot took that branch: the event's device had been up
for 5m55s and died 0.2 s after a season download was started.

Why it was rare is read from AOSP and was not reproduced on a device. The
module calls `bindService()` right after `startForegroundService()`. When the
bind registers first, `stopSelf()` does not bring the service down, and
`onServiceConnected` then promotes it by another route, so the branch looked
harmless. When `stopSelf()` wins that race the service is brought down with the
debt open.

Rules for a service started with `startForegroundService()`:

- call `startForeground()` first in `onStartCommand`, with no condition in
  front of it, on every start and not only the first
- wrap it in try/catch and decide to stop afterwards
- a repeat call can be refused where the first was not (Android 15+ checks the
  app's state again on every call for a time limited type such as dataSync);
  the earlier promotion still stands, so do not stop because of it
- never infer the start context from uptime or any other heuristic

## Symptom pattern

A fatal `RemoteServiceException$ForegroundServiceDidNotStartInTimeException`
with only framework frames, a fraction of a second after the action that starts
the service, on a device that booted a few minutes earlier.
