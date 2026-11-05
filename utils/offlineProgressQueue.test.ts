import { OFFLINE_PROGRESS_PENDING_KEY } from "@/constants/Downloads";
import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import {
  clearOfflineProgress,
  getOfflineProgress,
  markOfflineProgress,
} from "./offlineProgressQueue";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

const T1 = "2026-11-05T10:00:00.000Z";
const T2 = "2026-11-05T11:00:00.000Z";

beforeEach(() => clearMmkv());

describe("offlineProgressQueue", () => {
  test("queues an item once per user, with its latest save", () => {
    markOfflineProgress("alice", "episode-1", T1);
    markOfflineProgress("alice", "episode-1", T2);
    markOfflineProgress("alice", "episode-2", undefined);
    expect(getOfflineProgress("alice")).toEqual({
      "episode-1": T2,
      "episode-2": "",
    });
  });

  // Downloads have no owner: what one account watched offline must not be
  // handed to another account signed in on the same device.
  test("keeps each user's queue apart", () => {
    markOfflineProgress("alice", "episode-1", T1);
    markOfflineProgress("bob", "episode-2", T1);
    expect(getOfflineProgress("alice")).toEqual({ "episode-1": T1 });
    expect(getOfflineProgress("bob")).toEqual({ "episode-2": T1 });
  });

  test("clears only the items it is given", () => {
    markOfflineProgress("alice", "episode-1", T1);
    markOfflineProgress("alice", "episode-2", T1);
    markOfflineProgress("bob", "episode-1", T1);
    clearOfflineProgress("alice", { "episode-1": T1 });
    expect(getOfflineProgress("alice")).toEqual({ "episode-2": T1 });
    expect(getOfflineProgress("bob")).toEqual({ "episode-1": T1 });
  });

  // Progress saved again while a sync was out has not reached the server.
  test("keeps an item saved again since it was read", () => {
    markOfflineProgress("alice", "episode-1", T1);
    const read = getOfflineProgress("alice");
    markOfflineProgress("alice", "episode-1", T2);
    clearOfflineProgress("alice", read);
    expect(getOfflineProgress("alice")).toEqual({ "episode-1": T2 });
  });

  test("reads a corrupt record as empty", () => {
    storage.set(OFFLINE_PROGRESS_PENDING_KEY, "{not json");
    expect(getOfflineProgress("alice")).toEqual({});
    markOfflineProgress("alice", "episode-1", T1);
    expect(getOfflineProgress("alice")).toEqual({ "episode-1": T1 });
  });

  test("drops a user whose entry has the wrong shape", () => {
    storage.set(
      OFFLINE_PROGRESS_PENDING_KEY,
      JSON.stringify({ alice: 42, bob: null, carol: { "episode-1": T1 } }),
    );
    expect(getOfflineProgress("alice")).toEqual({});
    markOfflineProgress("bob", "episode-2", T1);
    expect(getOfflineProgress("bob")).toEqual({ "episode-2": T1 });
    expect(getOfflineProgress("carol")).toEqual({ "episode-1": T1 });
  });
});
