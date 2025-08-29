import * as BackgroundTask from "expo-background-task";
import { Platform } from "react-native";

const BackgroundTaskModule = !Platform.isTV ? BackgroundTask : null;

export const BACKGROUND_FETCH_TASK = "background-fetch";

export async function registerBackgroundFetchAsync() {
  try {
    await BackgroundTaskModule?.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 60 * 1, // 1 minute
    });
  } catch (error) {
    console.log("Error registering background fetch task", error);
  }
}

export async function unregisterBackgroundFetchAsync() {
  try {
    await BackgroundTaskModule?.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
  } catch (error) {
    console.log("Error unregistering background fetch task", error);
  }
}

export const BACKGROUND_FETCH_TASK_SESSIONS = "background-fetch-sessions";

export async function registerBackgroundFetchAsyncSessions() {
  try {
    console.log("Registering background fetch sessions");
    await BackgroundTaskModule?.registerTaskAsync(
      BACKGROUND_FETCH_TASK_SESSIONS,
      {
        minimumInterval: 1 * 60, // 1 minute
      },
    );
  } catch (error) {
    console.log("Error registering background fetch task", error);
  }
}

export async function unregisterBackgroundFetchAsyncSessions() {
  try {
    await BackgroundTaskModule?.unregisterTaskAsync(
      BACKGROUND_FETCH_TASK_SESSIONS,
    );
  } catch (error) {
    console.log("Error unregistering background fetch task", error);
  }
}
