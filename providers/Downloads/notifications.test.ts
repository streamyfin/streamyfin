import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import * as Notifications from "expo-notifications";
import type { TFunction } from "i18next";

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockGetPermissions = Notifications.getPermissionsAsync as jest.Mock;
const mockGetChannel = Notifications.getNotificationChannelAsync as jest.Mock;

import { Platform } from "react-native";
import { DOWNLOAD_NOTIFICATION_CHANNEL } from "@/constants/Notifications";
import {
  getNotificationContent,
  sendDownloadNotification,
} from "./notifications";

// The key, and its values when there are some, stand for the translation.
const t = ((key: string, values?: object) =>
  values ? `${key} ${JSON.stringify(values)}` : key) as unknown as TFunction;

const episode: BaseItemDto = {
  Name: "Pilot",
  Type: "Episode",
  SeriesName: "Lost",
  ParentIndexNumber: 1,
  IndexNumber: 1,
};
const movie: BaseItemDto = {
  Name: "Heat",
  Type: "Movie",
  ProductionYear: 1995,
};

describe("getNotificationContent", () => {
  it("names a completed episode with its number and series", () => {
    expect(getNotificationContent(episode, t)).toEqual({
      title: "home.downloads.toasts.download_completed",
      body: "Pilot - [S01E01] (Lost)",
    });
  });

  it("names a completed item that is neither an episode nor a movie in its title", () => {
    expect(
      getNotificationContent({ Name: "Concert", Type: "MusicVideo" }, t),
    ).toEqual({
      title:
        'home.downloads.toasts.download_completed_for_item {"item":"Concert"}',
      body: "Concert",
    });
  });

  it("says why a download failed, naming the item as a completed one is named", () => {
    expect(getNotificationContent(movie, t, { kind: "conversion" })).toEqual({
      title: "home.downloads.toasts.download_failed",
      body: 'home.downloads.failure.conversion {"item":"Heat (1995)"}',
    });
  });

  it("gives the status the server refused the download with", () => {
    expect(
      getNotificationContent(episode, t, { kind: "refused", status: 404 }),
    ).toEqual({
      title: "home.downloads.toasts.download_failed",
      body: 'home.downloads.failure.refused {"item":"Pilot - [S01E01] (Lost)","status":404}',
    });
  });
});

describe("sendDownloadNotification", () => {
  beforeEach(() => {
    mockSchedule.mockReset();
    mockGetPermissions.mockReset().mockResolvedValue({ status: "granted" });
    mockGetChannel.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  // The Android cases replace Platform.OS, which nothing else puts back.
  afterEach(() => jest.restoreAllMocks());

  it("says the notification was scheduled", async () => {
    mockSchedule.mockResolvedValue("id");

    await expect(sendDownloadNotification("title", "body")).resolves.toBe(true);
  });

  // Android takes it and drops it without an error, iOS refuses it ("Source is not authorized").
  it("says the notification will not be shown when the user did not allow notifications", async () => {
    for (const status of ["denied", "undetermined"]) {
      mockGetPermissions.mockResolvedValue({ status });

      await expect(sendDownloadNotification("title", "body")).resolves.toBe(
        false,
      );
    }
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  // Android lets the downloads channel be turned off on its own, the app's notifications left
  // on: what is posted to it is never shown.
  it("says the notification will not be shown when its Android channel is off", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    mockGetChannel.mockResolvedValue({ importance: 2 });

    await expect(sendDownloadNotification("title", "body")).resolves.toBe(
      false,
    );
    expect(mockGetChannel).toHaveBeenCalledWith(DOWNLOAD_NOTIFICATION_CHANNEL);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  // expo-notifications takes the Android channel from the trigger: a null trigger posted every
  // download notification to its fallback channel, whatever the content said.
  it("posts to the Android channel when it is on", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    mockGetChannel.mockResolvedValue({ importance: 5 });
    mockSchedule.mockResolvedValue("id");

    await expect(sendDownloadNotification("title", "body")).resolves.toBe(true);
    expect(mockSchedule.mock.calls[0][0].trigger).toEqual({
      channelId: DOWNLOAD_NOTIFICATION_CHANNEL,
    });
  });

  it("shows the notification at once on iOS", async () => {
    mockSchedule.mockResolvedValue("id");

    await sendDownloadNotification("title", "body");

    expect(mockSchedule.mock.calls[0][0].trigger).toBeNull();
  });

  it("says the notification was not scheduled when the system refuses it", async () => {
    mockSchedule.mockRejectedValue(
      new Error("ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE"),
    );

    await expect(sendDownloadNotification("title", "body")).resolves.toBe(
      false,
    );
  });
});
