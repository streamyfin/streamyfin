/**
 * Runs `task` on a microtask: once the current call stack has returned, before
 * any timer.
 *
 * It replaces InteractionManager.runAfterInteractions, a setImmediate stub
 * since React Native made it one, which React Native 0.87 removes. An error
 * thrown by the task is handled differently: the stub never settled its
 * promise and rethrew the error from a timer, an uncaught exception the global
 * handler treats as fatal. Here the error rejects the returned promise, and
 * since the callers do not await it, it surfaces as an unhandled rejection: a
 * LogBox warning in development and a non-fatal Sentry event in release.
 */
export const deferToMicrotask = (task: () => void): Promise<void> =>
  Promise.resolve().then(task);
