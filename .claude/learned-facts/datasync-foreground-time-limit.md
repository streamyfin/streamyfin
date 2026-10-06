# A dataSync Foreground Service Is Timed, and Must Leave the Foreground When Told

**Date**: 2026-10-06
**Category**: native-modules
**Key files**: `modules/background-downloader/android/.../DownloadService.kt`,
`ForegroundPromotion.kt`, `BackgroundDownloaderModule.kt`

## Detail

For an app targeting SDK 35+, Android 15 gives a `dataSync` foreground service
about six hours per 24 hours. When they are used up the system calls
`Service.onTimeout(startId, fgsType)` and, a few seconds later, kills the
process with `ForegroundServiceDidNotStopInTimeException` when the service
record still carries the type. The default `onTimeout` does nothing, so a
service without the override always dies there. That was Sentry
REACT-NATIVE-HT.

Read from `ActiveServices.java` (android-16.0.0_r1), not reproduced on a
device:

- The six hours count from the last time the app was on screen. `onFgsTimeout`
  re-arms the timer instead of firing when the process is TOP, or was TOP less
  than the limit ago. So the callback only ever arrives with the app off
  screen, and has been for the whole limit.
- `stopForeground()` is what clears the type and both timers. `stopSelf()` does
  not bring down a service that something is bound to with `BIND_AUTO_CREATE`,
  and ours always is, by the module. It stays up, in the foreground, with its
  notification. Call `stopForeground()` first, then `stopSelf(startId)`: the
  start id keeps it from stopping a start command that is still on its way,
  which would be a start left unanswered (see
  `foreground-service-start-must-be-answered`).
- While the limit is used up, `startForeground()` throws
  `ForegroundServiceStartNotAllowedException` ("Time limit already exhausted").
  `startForegroundService()` does not, and the start is counted as answered
  before the throw, so the existing catch and stop covers it.
- The limit resets when `startForeground()` is called with the process TOP, or
  after it has been TOP since the timeout. Nothing else resets it short of 24
  hours.

What it means for the downloads: OkHttp runs them in the module, so they
survive the service, but not the process losing the foreground. Off screen it
is frozen or killed, the transfer cannot be resumed, and JS reconciliation
drops a `downloading` record without a task or a file silently. So on a
timeout the module fails the running download with an error (JS shows the
failed notification) and holds the queue until `OnActivityEntersForeground`,
when the promotion is allowed again.

To force it on a device (60 s instead of six hours), keeping the app off
screen while a download runs:

```bash
adb shell device_config put activity_manager data_sync_fgs_timeout_duration 60000
```

## Symptom pattern

A fatal `RemoteServiceException$ForegroundServiceDidNotStopInTimeException`
with only framework frames, `in_foreground: false`, hours after app start.
