jest.mock("expo-background-task", () => ({
  registerTaskAsync: jest.fn(async () => {}),
  unregisterTaskAsync: jest.fn(async () => {}),
}));
jest.mock("expo-task-manager", () => ({
  isTaskRegisteredAsync: jest.fn(async () => false),
}));
jest.mock("@/utils/log", () => ({ writeErrorLog: jest.fn() }));

import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import {
  SESSIONS_TASK_INTERVAL_KEY,
  SESSIONS_TASK_INTERVAL_MINUTES,
} from "@/constants/Notifications";
import {
  BACKGROUND_FETCH_TASK_SESSIONS,
  registerBackgroundFetchAsyncSessions,
  unregisterBackgroundFetchAsyncSessions,
} from "@/utils/background-tasks";
import { storage } from "@/utils/mmkv";

const register = BackgroundTask.registerTaskAsync as jest.Mock;
const isRegistered = TaskManager.isTaskRegisteredAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  storage.clearAll();
  jest.spyOn(console, "log").mockImplementation(() => {});
  isRegistered.mockResolvedValue(false);
});

describe("the sessions background task", () => {
  // expo-background-task reads minimumInterval in minutes: the 600 and 900 the
  // app passed made it ten and fifteen hours.
  test("is registered to run every 15 minutes", async () => {
    await registerBackgroundFetchAsyncSessions();

    expect(register).toHaveBeenCalledWith(BACKGROUND_FETCH_TASK_SESSIONS, {
      minimumInterval: 15,
    });
    expect(SESSIONS_TASK_INTERVAL_MINUTES).toBe(15);
  });

  // An install that registered the task before still has the hours-long
  // interval, and a registered task was left as it was.
  test("is registered again once when an older build registered it", async () => {
    isRegistered.mockResolvedValue(true);

    await registerBackgroundFetchAsyncSessions();
    await registerBackgroundFetchAsyncSessions();

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(BACKGROUND_FETCH_TASK_SESSIONS, {
      minimumInterval: 15,
    });
  });

  // A registration restarts the schedule on Android, so a task already
  // registered with this interval is left alone at every launch.
  test("is left alone when it already runs at this interval", async () => {
    storage.set(SESSIONS_TASK_INTERVAL_KEY, SESSIONS_TASK_INTERVAL_MINUTES);
    isRegistered.mockResolvedValue(true);

    await registerBackgroundFetchAsyncSessions();

    expect(register).not.toHaveBeenCalled();
  });

  test("forgets its interval when it is unregistered", async () => {
    await registerBackgroundFetchAsyncSessions();
    await unregisterBackgroundFetchAsyncSessions();

    expect(storage.getNumber(SESSIONS_TASK_INTERVAL_KEY)).toBeUndefined();
  });
});
