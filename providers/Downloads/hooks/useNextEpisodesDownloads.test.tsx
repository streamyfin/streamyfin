import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { act, renderHook } from "@testing-library/react-native";
import { createStore, Provider } from "jotai";
import { DOCUMENTS, fakeFiles } from "@/test-utils/fileSystem";
import { clearMmkv } from "@/test-utils/mmkv";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "expo-file-system",
  () => jest.requireActual("@/test-utils/fileSystem").fileSystemModule,
);

const mockGetEpisodes = jest.fn();
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getTvShowsApi: () => ({ getEpisodes: mockGetEpisodes }),
}));
const mockGetSessions = jest.fn();
jest.mock("@jellyfin/sdk/lib/utils/api/session-api", () => ({
  getSessionApi: () => ({ getSessions: mockGetSessions }),
}));

const mockNetwork = { fetch: jest.fn(), addEventListener: jest.fn() };
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: () => mockNetwork.fetch(),
    addEventListener: (listener: unknown) =>
      mockNetwork.addEventListener(listener),
  },
}));
const mockFreeDiskStorage = jest.fn();
jest.mock("react-native-device-info", () => ({
  __esModule: true,
  default: { getFreeDiskStorage: () => mockFreeDiskStorage() },
}));

const mockResolveDefaultDownload = jest.fn();
jest.mock("../defaultDownload", () => ({
  resolveDefaultDownload: (args: unknown) => mockResolveDefaultDownload(args),
}));

// The real modules load the whole settings and auth stack; the hook only
// reads these two atoms.
const mockSettings = {
  nextEpisodesNetwork: "wifi",
  nextEpisodesDeleteAnyDownload: false,
};
jest.mock("@/utils/atoms/settings", () => {
  const { atom } = jest.requireActual("jotai");
  return { effectiveSettingsAtom: atom(() => mockSettings) };
});
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { userAtom: atom(null) };
});
const mockIsOnHomeNetwork = jest.fn();
const mockHomeNetworkConfig = jest.fn();
jest.mock("../homeNetwork", () => ({
  isOnHomeNetwork: (api: unknown) => mockIsOnHomeNetwork(api),
  homeNetworkConfig: () => mockHomeNetworkConfig(),
}));
jest.mock("@/utils/device", () => ({ getOrSetDeviceId: () => "device-1" }));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

import type { Bitrate } from "@/components/BitrateSelector";
import { NEXT_EPISODES_MIN_FREE_BYTES } from "@/constants/Downloads";
import { userAtom } from "@/providers/JellyfinProvider";
import {
  addDownloadedItem,
  clearAllDownloadedItems,
  getDownloadedItemById,
} from "../database";
import { nextEpisodesHoldAtom } from "../nextEpisodesHold";
import { nextEpisodesRulesAtom, withRule } from "../nextEpisodesRules";
import {
  removePendingDownload,
  savePendingDownload,
} from "../pendingDownloads";
import type { DownloadedItem } from "../types";
import { useNextEpisodesDownloads } from "./useNextEpisodesDownloads";

const WIFI = { isConnected: true, type: "wifi", details: {} };
const CELLULAR = { isConnected: true, type: "cellular", details: {} };
const PLENTY_OF_SPACE = NEXT_EPISODES_MIN_FREE_BYTES * 10;

const episode = (index: number, played = false): BaseItemDto => ({
  Id: `e${index}`,
  Name: `Episode ${index}`,
  Type: "Episode",
  SeriesId: "series-1",
  SeriesName: "Show",
  ParentIndexNumber: 1,
  IndexNumber: index,
  LocationType: "FileSystem",
  UserData: { Played: played },
});

const download = (item: BaseItemDto): DownloadedItem => ({
  item,
  mediaSource: {},
  videoFilePath: `${DOCUMENTS}/${item.Id}.mp4`,
  videoFileSize: 1,
  userData: {
    audioStreamIndex: 0,
    subtitleStreamIndex: -1,
    isTranscoded: false,
  },
});

const putOnDevice = (item: BaseItemDto) => {
  fakeFiles.add(`${DOCUMENTS}/${item.Id}.mp4`);
  addDownloadedItem(download(item));
};

const setUp = ({
  count = 2,
  deleteWatched = false,
  downloadedIds = [] as string[],
  canDownload = true,
} = {}) => {
  const store = createStore();
  store.set(userAtom as never, {
    Id: "user-1",
    Policy: { EnableContentDownloading: canDownload },
  });
  store.set(nextEpisodesRulesAtom, (rules) =>
    withRule(rules, "user-1", {
      seriesId: "series-1",
      seriesName: "Show",
      count,
      deleteWatched,
      downloadedIds,
    }),
  );
  // As the real start does, it leaves a pending record until native is done.
  const startBackgroundDownload = jest.fn(
    async (
      url: string,
      item: BaseItemDto,
      mediaSource: MediaSourceInfo,
      maxBitrate: Bitrate,
    ) =>
      savePendingDownload({
        itemId: item.Id!,
        status: "queued",
        enqueuedAt: new Date().toISOString(),
        inputUrl: url,
        videoFileName: `${item.Id}.mp4`,
        item,
        mediaSource,
        maxBitrate,
        deviceId: "device-1",
      }),
  );
  const onDataChange = jest.fn();
  return { store, startBackgroundDownload, onDataChange };
};

/** Renders the hook and waits for the check it starts with. */
const renderKeeper = async ({
  store,
  startBackgroundDownload,
  onDataChange,
}: ReturnType<typeof setUp>) => {
  const { result } = await renderHook(
    () =>
      useNextEpisodesDownloads({
        api: {} as never,
        processes: [],
        startBackgroundDownload,
        onDataChange,
      }),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    },
  );
  // Settles once the check the hook starts on mount, and this one queued
  // behind it, have both run.
  await act(() => result.current.runNextEpisodesCheck());
  return result;
};

const startedIds = (
  start: ReturnType<typeof setUp>["startBackgroundDownload"],
) => start.mock.calls.map((call) => (call[1] as BaseItemDto).Id);

beforeEach(() => {
  clearMmkv();
  // The database keeps a parsed copy in memory that clearing the store misses.
  clearAllDownloadedItems();
  fakeFiles.clear();
  jest.clearAllMocks();
  mockSettings.nextEpisodesNetwork = "wifi";
  mockIsOnHomeNetwork.mockReturnValue(false);
  mockHomeNetworkConfig.mockReturnValue({
    localUrl: "http://192.168.1.10:8096",
    homeWifiSSIDs: ["Home"],
    enabled: true,
  });
  mockSettings.nextEpisodesDeleteAnyDownload = false;
  mockNetwork.fetch.mockResolvedValue(WIFI);
  mockNetwork.addEventListener.mockReturnValue(() => {});
  mockFreeDiskStorage.mockResolvedValue(PLENTY_OF_SPACE);
  mockGetSessions.mockResolvedValue({ data: [] });
  mockGetEpisodes.mockResolvedValue({
    data: { Items: [episode(1, true), episode(2), episode(3), episode(4)] },
  });
  mockResolveDefaultDownload.mockImplementation(
    async ({ itemId }: { itemId: string }) => ({
      url: `https://jellyfin.example/${itemId}`,
      item: { ...episode(Number(itemId.slice(1))) },
      mediaSource: { Id: itemId },
      bitrate: { key: "Max", value: undefined },
    }),
  );
});

describe("useNextEpisodesDownloads", () => {
  test("downloads the next episodes after the last watched one", async () => {
    const setup = setUp({ count: 2 });

    await renderKeeper(setup);

    expect(startedIds(setup.startBackgroundDownload)).toEqual(["e2", "e3"]);
    expect(setup.store.get(nextEpisodesHoldAtom)).toBeNull();
  });

  test("downloads at the quality picked for the rule", async () => {
    const setup = setUp({ count: 1 });
    setup.store.set(nextEpisodesRulesAtom, (rules) => ({
      ...rules,
      "user-1": {
        "series-1": {
          ...rules["user-1"]["series-1"],
          bitrate: { key: "4 Mb/s", value: 4000000 },
        },
      },
    }));

    await renderKeeper(setup);

    expect(mockResolveDefaultDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "e2",
        bitrate: { key: "4 Mb/s", value: 4000000 },
      }),
    );
  });

  test("remembers which episodes it downloaded", async () => {
    const setup = setUp({ count: 2 });

    await renderKeeper(setup);

    const rule = setup.store.get(nextEpisodesRulesAtom)["user-1"]["series-1"];
    expect(rule.downloadedIds).toEqual(["e2", "e3"]);
  });

  // Running it again changes nothing: a missed trigger is made up by the next.
  test("downloads nothing that is already on the device", async () => {
    putOnDevice(episode(2));
    const setup = setUp({ count: 2 });

    await renderKeeper(setup);

    expect(startedIds(setup.startBackgroundDownload)).toEqual(["e3"]);
  });

  test("waits for Wi-Fi on mobile data, and says so", async () => {
    mockNetwork.fetch.mockResolvedValue(CELLULAR);
    const setup = setUp();

    await renderKeeper(setup);

    expect(setup.startBackgroundDownload).not.toHaveBeenCalled();
    expect(setup.store.get(nextEpisodesHoldAtom)).toBe("waiting_for_wifi");
  });

  test("uses mobile data when any network is allowed", async () => {
    mockNetwork.fetch.mockResolvedValue(CELLULAR);
    mockSettings.nextEpisodesNetwork = "any";
    const setup = setUp({ count: 1 });

    await renderKeeper(setup);

    expect(startedIds(setup.startBackgroundDownload)).toEqual(["e2"]);
  });

  // On the home network the app talks to the server's local address, so the
  // downloads never go through the remote connection.
  describe("home network only", () => {
    beforeEach(() => {
      mockSettings.nextEpisodesNetwork = "home";
    });

    test("waits on any other Wi-Fi, and says so", async () => {
      const setup = setUp();

      await renderKeeper(setup);

      expect(setup.startBackgroundDownload).not.toHaveBeenCalled();
      expect(setup.store.get(nextEpisodesHoldAtom)).toBe(
        "waiting_for_home_network",
      );
    });

    test("says when no home network is set up on the device", async () => {
      mockHomeNetworkConfig.mockReturnValue(null);
      const setup = setUp();

      await renderKeeper(setup);

      expect(setup.startBackgroundDownload).not.toHaveBeenCalled();
      expect(setup.store.get(nextEpisodesHoldAtom)).toBe(
        "home_network_not_set_up",
      );
    });

    test("downloads on the server's local address", async () => {
      mockIsOnHomeNetwork.mockReturnValue(true);
      const setup = setUp({ count: 1 });

      await renderKeeper(setup);

      expect(startedIds(setup.startBackgroundDownload)).toEqual(["e2"]);
      expect(setup.store.get(nextEpisodesHoldAtom)).toBeNull();
    });

    test("starts once the app switches to the local address", async () => {
      const setup = setUp({ count: 1 });
      const remote = { basePath: "https://jellyfin.example" };
      const local = { basePath: "http://192.168.1.10:8096" };
      mockIsOnHomeNetwork.mockImplementation((api) => api === local);
      const { rerender } = await renderHook(
        ({ api }: { api: typeof remote }) =>
          useNextEpisodesDownloads({
            api: api as never,
            processes: [],
            startBackgroundDownload: setup.startBackgroundDownload,
            onDataChange: setup.onDataChange,
          }),
        {
          initialProps: { api: remote },
          wrapper: ({ children }: { children: React.ReactNode }) => (
            <Provider store={setup.store}>{children}</Provider>
          ),
        },
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(setup.startBackgroundDownload).not.toHaveBeenCalled();

      await rerender({ api: local });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(startedIds(setup.startBackgroundDownload)).toEqual(["e2"]);
    });
  });

  // A download from the local address fails once the device leaves home.
  // The failed one is cleared, and a later check downloads it again.
  test("downloads an episode again after its download failed", async () => {
    const setup = setUp({ count: 1 });
    const result = await renderKeeper(setup);
    expect(startedIds(setup.startBackgroundDownload)).toEqual(["e2"]);

    removePendingDownload("e2");
    await act(() => result.current.runNextEpisodesCheck());

    expect(startedIds(setup.startBackgroundDownload)).toEqual(["e2", "e2"]);
  });

  test("starts once Wi-Fi is back", async () => {
    mockNetwork.fetch.mockResolvedValue(CELLULAR);
    const setup = setUp({ count: 1 });
    await renderKeeper(setup);
    const [listener] = mockNetwork.addEventListener.mock.calls.at(-1);

    mockNetwork.fetch.mockResolvedValue(WIFI);
    await act(async () => {
      listener(WIFI);
    });
    // The listener's check runs on its own; let it finish.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(startedIds(setup.startBackgroundDownload)).toEqual(["e2"]);
    expect(setup.store.get(nextEpisodesHoldAtom)).toBeNull();
  });

  test("stops at low storage, and says so", async () => {
    mockFreeDiskStorage
      .mockResolvedValueOnce(PLENTY_OF_SPACE)
      .mockResolvedValue(NEXT_EPISODES_MIN_FREE_BYTES - 1);
    const setup = setUp({ count: 3 });

    await renderKeeper(setup);

    expect(startedIds(setup.startBackgroundDownload)).toEqual(["e2"]);
    expect(setup.store.get(nextEpisodesHoldAtom)).toBe("low_space");
  });

  test("does nothing for a user not allowed to download", async () => {
    const setup = setUp({ canDownload: false });

    await renderKeeper(setup);

    expect(mockGetEpisodes).not.toHaveBeenCalled();
    expect(setup.startBackgroundDownload).not.toHaveBeenCalled();
  });

  test("deletes a watched episode it downloaded", async () => {
    putOnDevice(episode(1, true));
    const setup = setUp({ deleteWatched: true, downloadedIds: ["e1"] });

    await renderKeeper(setup);

    expect(getDownloadedItemById("e1")).toBeUndefined();
    expect(fakeFiles.deleted()).toContain(`${DOCUMENTS}/e1.mp4`);
    expect(setup.onDataChange).toHaveBeenCalled();
    const rule = setup.store.get(nextEpisodesRulesAtom)["user-1"]["series-1"];
    expect(rule.downloadedIds).not.toContain("e1");
  });

  test("keeps a watched episode downloaded by hand", async () => {
    putOnDevice(episode(1, true));
    const setup = setUp({ deleteWatched: true });

    await renderKeeper(setup);

    expect(getDownloadedItemById("e1")).toBeDefined();
  });

  test("deletes one downloaded by hand when that is allowed", async () => {
    putOnDevice(episode(1, true));
    mockSettings.nextEpisodesDeleteAnyDownload = true;
    const setup = setUp({ deleteWatched: true });

    await renderKeeper(setup);

    expect(getDownloadedItemById("e1")).toBeUndefined();
  });

  test("keeps the episode playing on this device", async () => {
    putOnDevice(episode(1, true));
    mockGetSessions.mockResolvedValue({
      data: [{ NowPlayingItem: { Id: "e1" } }],
    });
    const setup = setUp({ deleteWatched: true, downloadedIds: ["e1"] });

    await renderKeeper(setup);

    expect(getDownloadedItemById("e1")).toBeDefined();
  });

  // Without the sessions there is no telling what is playing.
  test("deletes nothing when the server cannot say what is playing", async () => {
    putOnDevice(episode(1, true));
    mockGetSessions.mockRejectedValue(new Error("offline"));
    const setup = setUp({ deleteWatched: true, downloadedIds: ["e1"] });

    await renderKeeper(setup);

    expect(getDownloadedItemById("e1")).toBeDefined();
    expect(startedIds(setup.startBackgroundDownload)).toEqual(["e2", "e3"]);
  });

  test("asks nothing of the server while offline", async () => {
    mockNetwork.fetch.mockResolvedValue({
      isConnected: false,
      type: "none",
      details: null,
    });
    const setup = setUp();

    await renderKeeper(setup);

    expect(mockGetEpisodes).not.toHaveBeenCalled();
  });
});
