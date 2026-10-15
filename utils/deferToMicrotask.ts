/**
 * Runs `task` on a microtask: once the current call stack has returned, before
 * any timer.
 *
 * That is what InteractionManager.runAfterInteractions did since React Native
 * made it a setImmediate stub, and React Native 0.87 removes it. Like the stub,
 * an error thrown by the task rejects the returned promise: React Native treats
 * an error thrown from a microtask or a scheduler task as fatal.
 */
export const deferToMicrotask = (task: () => void): Promise<void> =>
  Promise.resolve().then(task);
