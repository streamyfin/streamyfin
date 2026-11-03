import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { renderHook } from "@testing-library/react-native";
import { useSeerrSeriesRequest } from "./useSeerrSeriesRequest";

const mockPush = jest.fn();
let mockSeerrApi: object | undefined = {};
let mockOffline = false;
let mockSegments = ["(auth)", "(tabs)", "(libraries)"];

jest.mock("expo-router", () => ({ useSegments: () => mockSegments }));
// One router object, as the real hook returns, or the memo's deps change.
jest.mock("@/hooks/useAppRouter", () => {
  const router = { push: (href: unknown) => mockPush(href) };
  return { __esModule: true, default: () => router };
});
jest.mock("@/hooks/useSeerr", () => ({
  useSeerr: () => ({ seerrApi: mockSeerrApi }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null) };
});

const series: BaseItemDto = {
  Id: "series-1",
  Type: "Series",
  Name: "South Park",
  ProductionYear: 1997,
  ProviderIds: { Tmdb: "2190" },
};

beforeEach(() => {
  mockPush.mockClear();
  mockSeerrApi = {};
  mockOffline = false;
  mockSegments = ["(auth)", "(tabs)", "(libraries)"];
});

describe("useSeerrSeriesRequest", () => {
  test("opens the series' Seerr page in the tab it was opened from", async () => {
    const { result } = await renderHook(() => useSeerrSeriesRequest(series));

    result.current?.();

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(auth)/(tabs)/(libraries)/seerr/page",
      params: {
        id: "2190",
        mediaType: "tv",
        mediaTitle: "South Park",
        releaseYear: "1997",
        posterSrc: "",
        autoRequest: "true",
      },
    });
  });

  test("offers nothing while Seerr is not signed in", async () => {
    mockSeerrApi = undefined;
    const { result } = await renderHook(() => useSeerrSeriesRequest(series));
    expect(result.current).toBeUndefined();
  });

  // A downloaded series can be opened with no connection to Seerr at all.
  test("offers nothing offline", async () => {
    mockOffline = true;
    const { result } = await renderHook(() => useSeerrSeriesRequest(series));
    expect(result.current).toBeUndefined();
  });

  test("offers nothing for a series Seerr cannot identify", async () => {
    const { result } = await renderHook(() =>
      useSeerrSeriesRequest({ ...series, ProviderIds: {} }),
    );
    expect(result.current).toBeUndefined();
  });
});
