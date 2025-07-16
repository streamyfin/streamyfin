import * as BackgroundTask from "expo-background-task";

export const BACKGROUND_FETCH_TASK = "background-fetch";
export const BACKGROUND_FETCH_TASK_SESSIONS = "background-fetch-sessions";

export async function registerBackgroundFetchAsync() {
  try {
    await BackgroundTask.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 60, // 1 minute (in seconds, not milliseconds)
    });
  } catch (error) {
    console.log("Error registering background task", error);
  }
}

export async function unregisterBackgroundFetchAsync() {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
  } catch (error) {
    console.log("Error unregistering background task", error);
  }
}

export async function registerBackgroundFetchAsyncSessions() {
  try {
    console.log("Registering background task sessions");
    await BackgroundTask.registerTaskAsync(BACKGROUND_FETCH_TASK_SESSIONS, {
      minimumInterval: 60, // 1 minute
    });
  } catch (error) {
    console.log("Error registering background task sessions", error);
  }
}

export async function unregisterBackgroundFetchAsyncSessions() {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_FETCH_TASK_SESSIONS);
  } catch (error) {
    console.log("Error unregistering background task sessions", error);
  }
}
