import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

export const BACKGROUND_FETCH_TASK = "background-fetch";
export const BACKGROUND_FETCH_TASK_SESSIONS = "background-fetch-sessions";

export async function registerBackgroundFetchAsync() {
  if (Platform.isTV) {
    return;
  }

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_FETCH_TASK,
    );
    if (isRegistered) {
      console.log("Main background task already registered.");
      return;
    }

    console.log("Registering main background fetch task...");
    await BackgroundTask.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 60 * 1, // 1 minute
      stopOnTerminate: false, // Android only
      startOnBoot: false, // Android only
    });
  } catch (error) {
    console.error("Error registering main background fetch task:", error);
  }
}

export async function unregisterBackgroundFetchAsync() {
  if (Platform.isTV) {
    return;
  }

  try {
    console.log("Unregistering main background fetch task.");
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
  } catch (error) {
    console.error("Error unregistering main background fetch task:", error);
  }
}

export async function registerBackgroundFetchAsyncSessions() {
  if (Platform.isTV) {
    return;
  }

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_FETCH_TASK_SESSIONS,
    );
    if (isRegistered) {
      console.log("Sessions background task already registered.");
      return;
    }

    console.log("Registering background fetch sessions task...");
    await BackgroundTask.registerTaskAsync(BACKGROUND_FETCH_TASK_SESSIONS, {
      minimumInterval: 60 * 1, // 1 minute
      stopOnTerminate: false, // Android only
      startOnBoot: true, // Android only
    });
  } catch (error) {
    console.error("Error registering sessions background fetch task:", error);
  }
}

export async function unregisterBackgroundFetchAsyncSessions() {
  if (Platform.isTV) {
    return;
  }

  try {
    console.log("Unregistering sessions background fetch task.");
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_FETCH_TASK_SESSIONS);
  } catch (error) {
    console.error("Error unregistering sessions background fetch task:", error);
  }
}
