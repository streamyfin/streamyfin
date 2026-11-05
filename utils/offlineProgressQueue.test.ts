import { clearMmkv } from "@/test-utils/mmkv";
import {
  clearOfflineProgress,
  getOfflineProgress,
  markOfflineProgress,
} from "./offlineProgressQueue";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

beforeEach(() => clearMmkv());

describe("offlineProgressQueue", () => {
  test("queues an item once per user", () => {
    markOfflineProgress("alice", "episode-1");
    markOfflineProgress("alice", "episode-1");
    markOfflineProgress("alice", "episode-2");
    expect(getOfflineProgress("alice")).toEqual(["episode-1", "episode-2"]);
  });

  // Downloads have no owner: what one account watched offline must not be
  // handed to another account signed in on the same device.
  test("keeps each user's queue apart", () => {
    markOfflineProgress("alice", "episode-1");
    markOfflineProgress("bob", "episode-2");
    expect(getOfflineProgress("alice")).toEqual(["episode-1"]);
    expect(getOfflineProgress("bob")).toEqual(["episode-2"]);
  });

  test("clears only the items it is given", () => {
    markOfflineProgress("alice", "episode-1");
    markOfflineProgress("alice", "episode-2");
    markOfflineProgress("bob", "episode-1");
    clearOfflineProgress("alice", ["episode-1"]);
    expect(getOfflineProgress("alice")).toEqual(["episode-2"]);
    expect(getOfflineProgress("bob")).toEqual(["episode-1"]);
  });

  test("reads a corrupt record as empty", () => {
    const { storage } = jest.requireActual("@/utils/mmkv");
    const { OFFLINE_PROGRESS_PENDING_KEY } = jest.requireActual(
      "@/constants/Downloads",
    );
    storage.set(OFFLINE_PROGRESS_PENDING_KEY, "{not json");
    expect(getOfflineProgress("alice")).toEqual([]);
    markOfflineProgress("alice", "episode-1");
    expect(getOfflineProgress("alice")).toEqual(["episode-1"]);
  });
});
