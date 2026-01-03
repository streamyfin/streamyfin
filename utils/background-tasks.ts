import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { writeErrorLog } from "@/utils/log";

const BackgroundTaskModule = !Platform.isTV ? BackgroundTask : null;

export const BACKGROUND_FETCH_TASK = "background-fetch";
export const BACKGROUND_FETCH_TASK_SESSIONS = "background-fetch-sessions";

export async function registerBackgroundFetchAsync(): Promise<boolean> {
  if (!BackgroundTaskModule) {
    console.log(
      "BackgroundTask module not available (TV platform or not supported)",
    );
    return false;
  }

  try {
    // Check if task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_FETCH_TASK,
    );
    if (isRegistered) {
      console.log("Background fetch task already registered");
      return true;
    }

    await BackgroundTaskModule!.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    const minimumInterval = Platform.OS === "android" ? 600 : 900;
    await BackgroundTaskModule!.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval,
    });
    console.log("Successfully registered background fetch task");
    return true;
  } catch (error) {
    // Log error but don't throw - background fetch is not critical
    console.warn("Failed to register background fetch task:", error);
    writeErrorLog("Error registering background fetch task", error);
    return false;
  }
}

export async function unregisterBackgroundFetchAsync(): Promise<boolean> {
  if (!BackgroundTaskModule) return false;
  try {
    await BackgroundTaskModule!.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    console.log("Successfully unregistered background fetch task");
    return true;
  } catch (error) {
    // Log error but don't throw - unregistering is not critical
    console.warn("Failed to unregister background fetch task:", error);
    writeErrorLog("Error unregistering background fetch task", error);
    return false;
  }
}

export async function unregisterBackgroundFetchAsyncSessions(): Promise<boolean> {
  if (!BackgroundTaskModule) return false;
  try {
    await BackgroundTaskModule!.unregisterTaskAsync(
      BACKGROUND_FETCH_TASK_SESSIONS,
    );
    console.log("Successfully unregistered background fetch sessions task");
    return true;
  } catch (error) {
    // Log error but don't throw - unregistering is not critical
    console.warn("Failed to unregister background fetch sessions task:", error);
    writeErrorLog("Error unregistering background fetch sessions task", error);
    return false;
  }
}

export async function registerBackgroundFetchAsyncSessions(): Promise<boolean> {
  if (!BackgroundTaskModule) {
    console.log(
      "BackgroundTask module not available (TV platform or not supported)",
    );
    return false;
  }

  try {
    // Check if task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_FETCH_TASK_SESSIONS,
    );
    if (isRegistered) {
      console.log("Background fetch sessions task already registered");
      return true;
    }

    await BackgroundTaskModule!.unregisterTaskAsync(
      BACKGROUND_FETCH_TASK_SESSIONS,
    );
    const minimumInterval = Platform.OS === "android" ? 600 : 900;
    await BackgroundTaskModule!.registerTaskAsync(
      BACKGROUND_FETCH_TASK_SESSIONS,
      {
        minimumInterval,
      },
    );
    console.log("Successfully registered background fetch sessions task");
    return true;
  } catch (error) {
    // Log error but don't throw - background fetch is not critical
    console.warn("Failed to register background fetch sessions task:", error);
    writeErrorLog("Error registering background fetch sessions task", error);
    return false;
  }
}
