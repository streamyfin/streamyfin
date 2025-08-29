import * as BackgroundTask from "expo-background-task";
import { Platform } from "react-native";
import { writeErrorLog } from "@/utils/log";

const BackgroundTaskModule = !Platform.isTV ? BackgroundTask : null;

export const BACKGROUND_FETCH_TASK = "background-fetch";
export const BACKGROUND_FETCH_TASK_SESSIONS = "background-fetch-sessions";

export async function registerBackgroundFetchAsync(): Promise<boolean> {
  if (!BackgroundTaskModule) return false;
  try {
    await BackgroundTaskModule!.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    const minimumInterval = Platform.OS === "android" ? 600 : 900;
    await BackgroundTaskModule!.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval,
    });
    return true;
  } catch (error) {
    writeErrorLog("Error registering background fetch task", error);
    return false;
  }
}

export async function unregisterBackgroundFetchAsync(): Promise<boolean> {
  if (!BackgroundTaskModule) return false;
  try {
    await BackgroundTaskModule!.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    return true;
  } catch (error) {
    writeErrorLog("Error unregistering background fetch task", error);
    return false;
  }
}

export async function registerBackgroundFetchAsyncSessions(): Promise<boolean> {
  if (!BackgroundTaskModule) return false;
  try {
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
    return true;
  } catch (error) {
    writeErrorLog("Error registering background fetch sessions task", error);
    return false;
  }
}

export async function unregisterBackgroundFetchAsyncSessions(): Promise<boolean> {
  if (!BackgroundTaskModule) return false;
  try {
    await BackgroundTaskModule!.unregisterTaskAsync(
      BACKGROUND_FETCH_TASK_SESSIONS,
    );
    return true;
  } catch (error) {
    writeErrorLog("Error unregistering background fetch sessions task", error);
    return false;
  }
}
