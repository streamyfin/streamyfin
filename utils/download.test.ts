import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, renderHook } from "@testing-library/react-native";
import { File } from "expo-file-system";
import { getDefaultStore } from "jotai";
import { PixelRatio } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeApi } from "@/test-utils/jellyfinApi";
import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import useDownloadHelper from "./download";

// The session is the real atoms, seeded: the poster URL is built from the
// api's base path.
jest.mock("@/providers/JellyfinProvider", () =>
  jest.requireActual("@/test-utils/realSessionAtoms"),
);

const api = makeApi();

const episode = {
  Id: "episode",
  Type: "Episode",
  ImageTags: { Primary: "still" },
  SeriesId: "series",
  SeriesPrimaryImageTag: "series-v1",
} satisfies BaseItemDto;

const SERIES_POSTER = `${api.basePath}/Items/series/Images/Primary?fillWidth=500&quality=90&tag=series-v1`;

beforeEach(() => {
  clearMmkv();
  getDefaultStore().set(apiAtom, api);
  // pixels: true asks for the width as given, whatever the density.
  jest.spyOn(PixelRatio, "get").mockReturnValue(2);
  // The download lands on the fake disk; only its base64 content is faked.
  jest
    .spyOn(File, "downloadFileAsync")
    .mockImplementation(
      async () => ({ base64: async () => "poster-data" }) as unknown as File,
    );
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("saveSeriesPrimaryImage", () => {
  test("downloads the series' tagged poster and stores it under the series id", async () => {
    const { result } = await renderHook(() => useDownloadHelper());

    await act(() => result.current.saveSeriesPrimaryImage(episode));

    expect(File.downloadFileAsync).toHaveBeenCalledWith(
      SERIES_POSTER,
      expect.anything(),
      expect.anything(),
    );
    expect(storage.getString("series")).toBe("poster-data");
  });

  test("a poster already stored is not downloaded again", async () => {
    storage.set("series", "already-there");
    const { result } = await renderHook(() => useDownloadHelper());

    await act(() => result.current.saveSeriesPrimaryImage(episode));

    expect(File.downloadFileAsync).not.toHaveBeenCalled();
  });
});
