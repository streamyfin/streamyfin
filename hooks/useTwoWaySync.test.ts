import type {
  BaseItemDto,
  UserPolicy,
} from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import {
  addDownloadedItem,
  clearAllDownloadedItems,
  getDownloadedItemById,
  updateDownloadedItem,
} from "@/providers/Downloads/database";
import type { DownloadedItem } from "@/providers/Downloads/types";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { clearMmkv } from "@/test-utils/mmkv";
import { isExpectedError } from "@/utils/errors";
import { useTwoWaySync } from "./useTwoWaySync";

const mockLogAndCaptureError = jest.fn();

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi } = jest.requireActual("@/test-utils/jellyfinApi");
  return { apiAtom: atom(makeApi()), userAtom: atom({ Id: "user-1" }) };
});
// The real downloads database, on the MMKV double: what a refused push
// leaves behind has to be what the next run reads.
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => jest.requireActual("@/providers/Downloads/database"),
}));
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({ isConnected: true }),
}));
// What reaches Sentry is utils/log's rule and is tested there. Here it is
// enough to see what the sync hands over, and whether it is marked expected.
jest.mock("@/utils/log", () => ({
  logAndCaptureError: (...args: unknown[]) => mockLogAndCaptureError(...args),
}));

const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;

// Only the two fields the server's rule reads; it sends the whole policy.
const signInWith = (policy?: Partial<UserPolicy>) =>
  getDefaultStore().set(userAtom, {
    Id: "user-1",
    Policy: policy as UserPolicy | undefined,
  });

const WATCHED_OFFLINE = "2026-10-05T20:00:00.000Z";
const WATCHED_OFFLINE_AGAIN = "2026-10-06T20:00:00.000Z";
const SEEN_BY_SERVER = "2026-10-01T20:00:00.000Z";
const OFFLINE_POSITION_TICKS = 6_000_000_000;

// A download watched offline after the server last saw it, so its state is
// waiting to be pushed. A movie unless told otherwise.
const download = (id: string, item: Partial<BaseItemDto> = {}) =>
  addDownloadedItem({
    item: {
      Id: id,
      Type: "Movie",
      UserData: {
        LastPlayedDate: WATCHED_OFFLINE,
        PlaybackPositionTicks: OFFLINE_POSITION_TICKS,
        Played: false,
      },
      ...item,
    },
  } as DownloadedItem);

// What the player writes when the download is played once more.
const watchAgain = (id: string) => {
  const downloaded = getDownloadedItemById(id)!;
  updateDownloadedItem(id, {
    ...downloaded,
    item: {
      ...downloaded.item,
      UserData: {
        ...downloaded.item.UserData,
        LastPlayedDate: WATCHED_OFFLINE_AGAIN,
      },
    },
  });
};

const itemUrl = (id: string) => new RegExp(`/Items/${id}(\\?|$)`);
const userDataUrl = (id: string) => new RegExp(`/UserItems/${id}/UserData`);

const serverHas = (id: string, lastPlayed = SEEN_BY_SERVER) =>
  api.mock.onGet(itemUrl(id)).reply(200, {
    Id: id,
    UserData: { LastPlayedDate: lastPlayed, PlaybackPositionTicks: 0 },
  });

const pushes = (id: string) =>
  api.mock.history.post.filter((request) => userDataUrl(id).test(request.url!));

// One run of the sync, as each launch and each return to the home screen
// starts it: a hook mounted from scratch.
const sync = async (...ids: string[]) => {
  const { result } = await renderHook(() => useTwoWaySync());
  const results = await Promise.all(
    ids.map((id) => result.current.syncPlaybackState(id)),
  );
  return ids.length === 1 ? results[0] : results;
};

// The page a reverse proxy puts in the server's place.
const GATEWAY_BLOCK = [
  403,
  "<!DOCTYPE html><html><body>Access denied</body></html>",
  { "content-type": "text/html" },
] as const;

beforeEach(() => {
  api.mock.reset();
  signInWith();
  mockLogAndCaptureError.mockClear();
  clearMmkv();
  clearAllDownloadedItems();
});

describe("useTwoWaySync — a push the server refuses", () => {
  // REACT-NATIVE-DB: the same push was sent on every launch and refused
  // every time, 37 events from 3 users in two days. Jellyfin answers 403 when
  // the user's policy does not allow changing user data, 404 when the item
  // is gone or no longer visible to them: neither changes by asking again.
  test.each([403, 404])(
    "is not sent again after the server answered %i",
    async (status) => {
      download("movie-1");
      serverHas("movie-1");
      api.mock.onPost(userDataUrl("movie-1")).reply(status);

      expect(await sync("movie-1")).toBe(false);
      expect(await sync("movie-1")).toBe(false);

      expect(pushes("movie-1")).toHaveLength(1);
    },
  );

  // Most downloads are episodes, and those are stored by series, season and
  // episode number, not by id.
  test("is not sent again for an episode either", async () => {
    download("episode-1", {
      Type: "Episode",
      SeriesId: "series-1",
      ParentIndexNumber: 1,
      IndexNumber: 2,
    });
    serverHas("episode-1");
    api.mock.onPost(userDataUrl("episode-1")).reply(403);

    await sync("episode-1");
    await sync("episode-1");

    expect(pushes("episode-1")).toHaveLength(1);
  });

  test("leaves the download and its offline progress in place", async () => {
    download("movie-1");
    serverHas("movie-1");
    api.mock.onPost(userDataUrl("movie-1")).reply(403);

    await sync("movie-1");
    await sync("movie-1");

    expect(getDownloadedItemById("movie-1")?.item.UserData).toMatchObject({
      LastPlayedDate: WATCHED_OFFLINE,
      PlaybackPositionTicks: OFFLINE_POSITION_TICKS,
    });
  });

  // The refusal is remembered for the state that was refused, not for the
  // item: an admin can give the permission back, and new progress is the
  // moment to find out.
  test("is tried once more when the item is watched offline again", async () => {
    download("movie-1");
    serverHas("movie-1");
    api.mock.onPost(userDataUrl("movie-1")).reply(403);
    await sync("movie-1");

    watchAgain("movie-1");
    await sync("movie-1");
    await sync("movie-1");

    expect(pushes("movie-1")).toHaveLength(2);
  });

  // The refusal comes back while the player is writing: remembering it must
  // not put the download back to what it was when the push went out.
  test("keeps what was watched while the push was on its way", async () => {
    download("movie-1");
    serverHas("movie-1");
    api.mock.onPost(userDataUrl("movie-1")).reply(() => {
      watchAgain("movie-1");
      return [403];
    });

    await sync("movie-1");

    expect(
      getDownloadedItemById("movie-1")?.item.UserData?.LastPlayedDate,
    ).toBe(WATCHED_OFFLINE_AGAIN);
    // And that newer state was not the one refused, so it is still owed.
    await sync("movie-1");
    expect(pushes("movie-1")).toHaveLength(2);
  });

  test("still takes the server's state once that is the newer one", async () => {
    download("movie-1");
    serverHas("movie-1");
    api.mock.onPost(userDataUrl("movie-1")).reply(403);
    await sync("movie-1");

    api.mock.reset();
    api.mock.onGet(itemUrl("movie-1")).reply(200, {
      Id: "movie-1",
      UserData: {
        LastPlayedDate: WATCHED_OFFLINE_AGAIN,
        PlaybackPositionTicks: 42,
      },
    });
    await sync("movie-1");

    expect(getDownloadedItemById("movie-1")?.item.UserData).toMatchObject({
      LastPlayedDate: WATCHED_OFFLINE_AGAIN,
      PlaybackPositionTicks: 42,
    });
  });

  test("is logged as the server's answer, not reported as a failure", async () => {
    download("movie-1");
    serverHas("movie-1");
    api.mock.onPost(userDataUrl("movie-1")).reply(403);

    await sync("movie-1");

    expect(mockLogAndCaptureError).toHaveBeenCalledTimes(1);
    const [message, error] = mockLogAndCaptureError.mock.calls[0];
    expect(message).toBe("Pushing offline playback state to server failed");
    expect(isExpectedError(error)).toBe(true);
  });

  // All the downloads sync side by side; this pins that one refusal stays
  // with its own item.
  test("does not keep another item's state from reaching the server", async () => {
    download("movie-1");
    download("movie-2");
    serverHas("movie-1");
    serverHas("movie-2");
    api.mock.onPost(userDataUrl("movie-1")).reply(403);
    api.mock.onPost(userDataUrl("movie-2")).reply(200, {});

    expect(await sync("movie-1", "movie-2")).toEqual([false, true]);
    expect(JSON.parse(pushes("movie-2")[0].data)).toMatchObject({
      LastPlayedDate: WATCHED_OFFLINE,
      PlaybackPositionTicks: OFFLINE_POSITION_TICKS,
    });
  });
});

describe("useTwoWaySync — a user who may not change their user data", () => {
  // What REACT-NATIVE-DB's 403 was: Jellyfin refuses the push for anyone but
  // an administrator when their policy has EnableUserPreferenceAccess off.
  // The app holds that policy, so it does not have to ask to find out.
  test("has nothing pushed, and nothing logged", async () => {
    signInWith({ IsAdministrator: false, EnableUserPreferenceAccess: false });
    download("movie-1");
    serverHas("movie-1");

    expect(await sync("movie-1")).toBe(false);

    expect(api.mock.history.post).toHaveLength(0);
    expect(mockLogAndCaptureError).not.toHaveBeenCalled();
  });

  // Nothing was refused, so nothing is marked: the state is still owed.
  test("has it pushed once an admin gives the permission back", async () => {
    signInWith({ IsAdministrator: false, EnableUserPreferenceAccess: false });
    download("movie-1");
    serverHas("movie-1");
    api.mock.onPost(userDataUrl("movie-1")).reply(200, {});
    await sync("movie-1");

    signInWith({ IsAdministrator: false, EnableUserPreferenceAccess: true });

    expect(await sync("movie-1")).toBe(true);
    expect(pushes("movie-1")).toHaveLength(1);
  });

  test("still takes the server's newer state", async () => {
    signInWith({ IsAdministrator: false, EnableUserPreferenceAccess: false });
    download("movie-1");
    serverHas("movie-1", WATCHED_OFFLINE_AGAIN);

    await sync("movie-1");

    expect(
      getDownloadedItemById("movie-1")?.item.UserData?.LastPlayedDate,
    ).toBe(WATCHED_OFFLINE_AGAIN);
  });

  test("does not hold an administrator back", async () => {
    signInWith({ IsAdministrator: true, EnableUserPreferenceAccess: false });
    download("movie-1");
    serverHas("movie-1");
    api.mock.onPost(userDataUrl("movie-1")).reply(200, {});

    expect(await sync("movie-1")).toBe(true);
  });
});

describe("useTwoWaySync — a push that did not get an answer about the item", () => {
  // A broken or busy server, a rate limit, no connection, a proxy refusing
  // in the server's place: the state is still owed, and the next run sends it.
  test.each([
    ["a 500", (url: RegExp) => api.mock.onPost(url).reply(500)],
    ["a 429", (url: RegExp) => api.mock.onPost(url).reply(429)],
    ["a 503", (url: RegExp) => api.mock.onPost(url).reply(503)],
    ["no connection", (url: RegExp) => api.mock.onPost(url).networkError()],
    [
      "a gateway's own 403 page",
      (url: RegExp) => api.mock.onPost(url).reply(...GATEWAY_BLOCK),
    ],
  ])("is sent again after %s", async (_name, fail) => {
    download("movie-1");
    serverHas("movie-1");
    fail(userDataUrl("movie-1"));

    expect(await sync("movie-1")).toBe(false);
    expect(await sync("movie-1")).toBe(false);

    expect(pushes("movie-1")).toHaveLength(2);
  });

  test("reaches the server on the run after the failure", async () => {
    download("movie-1");
    serverHas("movie-1");
    api.mock.onPost(userDataUrl("movie-1")).replyOnce(500);
    api.mock.onPost(userDataUrl("movie-1")).reply(200, {});

    expect(await sync("movie-1")).toBe(false);
    expect(await sync("movie-1")).toBe(true);
  });

  // REACT-NATIVE-9S: a 500 can be the server choking on what the app sent,
  // so it stays a report.
  test("is reported when the server answered 500", async () => {
    download("movie-1");
    serverHas("movie-1");
    api.mock.onPost(userDataUrl("movie-1")).reply(500);

    await sync("movie-1");

    const [, error] = mockLogAndCaptureError.mock.calls[0];
    expect(isExpectedError(error)).toBe(false);
  });
});

describe("useTwoWaySync — the server's copy cannot be read", () => {
  // REACT-NATIVE-3Q: Jellyfin answers every request of a user with 403 while
  // they are outside their access schedule, or away from home without remote
  // access.
  test("a 403 is logged as the server's answer and nothing is pushed", async () => {
    download("movie-1");
    api.mock.onGet(itemUrl("movie-1")).reply(403);

    expect(await sync("movie-1")).toBe(false);

    expect(api.mock.history.post).toHaveLength(0);
    expect(mockLogAndCaptureError).toHaveBeenCalledTimes(1);
    const [message, error] = mockLogAndCaptureError.mock.calls[0];
    expect(message).toBe("Fetching remote item during playback sync failed");
    expect(isExpectedError(error)).toBe(true);
  });

  test("a 404 is passed over in silence and nothing is pushed", async () => {
    download("movie-1");
    api.mock.onGet(itemUrl("movie-1")).reply(404);

    expect(await sync("movie-1")).toBe(false);

    expect(api.mock.history.post).toHaveLength(0);
    expect(mockLogAndCaptureError).not.toHaveBeenCalled();
  });

  // Nothing was refused about the playback state itself, so it stays owed:
  // the same user is let in again an hour later, or back on their own wifi.
  test("the offline state is pushed once the server lets the user in again", async () => {
    download("movie-1");
    api.mock.onGet(itemUrl("movie-1")).replyOnce(403);
    serverHas("movie-1");
    api.mock.onPost(userDataUrl("movie-1")).reply(200, {});

    expect(await sync("movie-1")).toBe(false);
    expect(await sync("movie-1")).toBe(true);
  });

  // REACT-NATIVE-A9: unlike a refusal, this one is not an answer.
  test("a 500 is reported", async () => {
    download("movie-1");
    api.mock.onGet(itemUrl("movie-1")).reply(500);

    await sync("movie-1");

    const [, error] = mockLogAndCaptureError.mock.calls[0];
    expect(isExpectedError(error)).toBe(false);
  });
});
