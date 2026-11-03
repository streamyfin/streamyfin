import { redirectSystemPath } from "./nativeIntent";

// The music notification on Android opens the app with this link
// (react-native-track-player's MusicService), and Expo Router used to send it
// to the library route with "notification.click" as the library id: Sentry
// REACT-NATIVE-EM and EN. How the app's own routes take it is pinned in
// utils/appLinking.test.ts.
const MUSIC_NOTIFICATION_LINK = "trackplayer://notification.click";

describe("redirectSystemPath", () => {
  test("goes nowhere when the music notification is tapped", () => {
    expect(
      redirectSystemPath({ path: MUSIC_NOTIFICATION_LINK, initial: false }),
    ).toBeNull();
  });

  test("starts the app as the launcher does when the notification launched it", () => {
    expect(
      redirectSystemPath({ path: MUSIC_NOTIFICATION_LINK, initial: true }),
    ).toBeNull();
  });

  test("goes nowhere for any other link of the music player", () => {
    expect(
      redirectSystemPath({
        path: "TrackPlayer://notification.click",
        initial: false,
      }),
    ).toBeNull();
    expect(
      redirectSystemPath({ path: "trackplayer://", initial: true }),
    ).toBeNull();
  });

  test("passes the app's own links through untouched", () => {
    for (const path of [
      "streamyfin:///",
      "streamyfin://",
      "streamyfin://topshelf/item?id=f137a2dd21bbc1b99aa5c0f6bf02a805",
      "streamyfin://topshelf/play?id=f137a2dd21bbc1b99aa5c0f6bf02a805",
      "/(auth)/(tabs)/(home)",
    ]) {
      expect(redirectSystemPath({ path, initial: true })).toBe(path);
      expect(redirectSystemPath({ path, initial: false })).toBe(path);
    }
  });

  // The scheme alone decides: a link of the app that happens to mention the
  // music player is still the app's.
  test("keeps an app link whose path mentions the music player", () => {
    const path = "streamyfin://search?q=trackplayer://notification.click";
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
  });
});
