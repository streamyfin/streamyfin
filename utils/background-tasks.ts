import { Platform } from "react-native";
const BackgroundFetch = !Platform.isTV
  ? require("expo-background-fetch")
  : null;

export const BACKGROUND_FETCH_TASK = "background-fetch";

export async function registerBackgroundFetchAsync() {
  try {
    BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 3 * 1, // 1 minutes
      stopOnTerminate: false, // android only,
      startOnBoot: false, // android only
    });
  } catch (error) {
    console.log("Error registering background fetch task", error);
  }
}

export async function unregisterBackgroundFetchAsync() {
  try {
    BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
  } catch (error) {
    console.log("Error unregistering background fetch task", error);
  }
}

export const BACKGROUND_FETCH_TASK_RECENTLY_ADDED =
  "background-fetch-recently-added";

export async function registerBackgroundFetchAsyncRecentlyAdded() {
  try {
    BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK_RECENTLY_ADDED, {
      minimumInterval: 60 * 60, // 60 minutes
      stopOnTerminate: false, // android only,
      startOnBoot: true, // android only
    });
  } catch (error) {
    console.log("Error registering background fetch task", error);
  }
}

export async function unregisterBackgroundFetchAsyncRecentlyAdded() {
  try {
    BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK_RECENTLY_ADDED);
  } catch (error) {
    console.log("Error unregistering background fetch task", error);
  }
}
