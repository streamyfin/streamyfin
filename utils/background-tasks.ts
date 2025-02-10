import { Platform } from "react-native";
const BackgroundFetch = !Platform.isTV
  ? require("expo-background-fetch")
  : null;

export const BACKGROUND_FETCH_TASK = "background-fetch";

export async function registerBackgroundFetchAsync() {
  try {
    BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 60 * 1, // 1 minutes
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
