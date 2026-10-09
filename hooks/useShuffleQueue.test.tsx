import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, renderHook } from "@testing-library/react-native";
import { useShuffleQueue } from "./useShuffleQueue";

const mockPlayMedia = jest.fn();
const mockSetShuffleQueue = jest.fn();

jest.mock("@/hooks/usePlayMedia", () => ({
  usePlayMedia: () => mockPlayMedia,
}));
jest.mock("jotai", () => ({
  ...jest.requireActual("jotai"),
  useSetAtom: () => mockSetShuffleQueue,
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
}));
jest.mock("@/utils/jellyfin/getDefaultPlaySettings", () => ({
  // Where an item starts is covered by getDefaultPlaySettings.test.ts.
  getAdjacentStartTicks: (item: BaseItemDto) =>
    item.UserData?.PlaybackPositionTicks,
  getDefaultPlaySettings: () => ({
    mediaSource: { Id: "source" },
    audioIndex: 0,
    subtitleIndex: -1,
  }),
}));
jest.mock("@/utils/shuffle", () => ({
  shuffle: (items: BaseItemDto[]) => [...items].reverse(),
}));

describe("useShuffleQueue", () => {
  beforeEach(() => {
    mockPlayMedia.mockReset().mockResolvedValue(undefined);
    mockSetShuffleQueue.mockReset();
  });

  test("forwards every playable shuffled episode to the shared play queue", async () => {
    const first: BaseItemDto = { Id: "episode-1", Type: "Episode" };
    const second: BaseItemDto = {
      Id: "episode-2",
      Type: "Episode",
      UserData: { PlaybackPositionTicks: 40_000_000 },
    };
    const { result } = await renderHook(() => useShuffleQueue());
    await act(async () => {
      result.current.startShuffle([
        first,
        { Id: "missing", LocationType: "Virtual" },
        { Name: "No item ID" },
        second,
      ]);
    });

    expect(mockPlayMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "episode-2",
        playbackPositionTicks: 40_000_000,
        offline: false,
      }),
      {
        preserveShuffleQueue: true,
        item: second,
        queueItemIds: ["episode-2", "episode-1"],
      },
    );
    expect(mockSetShuffleQueue).toHaveBeenCalledWith({
      items: [second, first],
    });
  });

  test("does not launch a queue containing only missing media", async () => {
    const { result } = await renderHook(() => useShuffleQueue());
    await act(async () => {
      result.current.startShuffle([
        { Id: "missing", LocationType: "Virtual" },
        {},
      ]);
    });

    expect(mockPlayMedia).not.toHaveBeenCalled();
    expect(mockSetShuffleQueue).not.toHaveBeenCalled();
  });
});
