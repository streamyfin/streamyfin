import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type React from "react";
import { MediaRequestStatus, type TvDetails } from "@/utils/seerr/types";
import { useSeerrSeasonRequest } from "./useSeerrSeasonRequest";

const mockSettings: {
  enableSpecialEpisodes?: boolean;
  partialRequestsEnabled?: boolean;
} = {};

jest.mock("@/hooks/useSeerr", () => ({
  useSeerr: () => ({
    seerrApi: { userQuota: async () => ({ tv: {} }) },
    seerrUser: { id: 1, permissions: 0 },
  }),
}));
jest.mock("@/hooks/useSeerrPublicSettings", () => ({
  useSeerrPublicSettings: () => mockSettings,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

// Specials, a first season already asked for, and a second still free.
const series = {
  seasons: [
    { seasonNumber: 0, episodeCount: 4 },
    { seasonNumber: 1, episodeCount: 10 },
    { seasonNumber: 2, episodeCount: 8 },
  ],
  mediaInfo: {
    requests: [
      {
        status: MediaRequestStatus.APPROVED,
        is4k: false,
        seasons: [{ seasonNumber: 1, status: MediaRequestStatus.APPROVED }],
      },
    ],
    seasons: [],
  },
} as unknown as TvDetails;

const render = (
  props: Partial<Parameters<typeof useSeerrSeasonRequest>[0]> = {},
) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    (initial: Parameters<typeof useSeerrSeasonRequest>[0]) =>
      useSeerrSeasonRequest(initial),
    {
      initialProps: {
        details: series,
        enabled: true,
        quotaUserId: 1,
        ...props,
      },
      wrapper,
    },
  );
};

// The seasons of a series to request, the phone's sheet and the TV's alike.
describe("useSeerrSeasonRequest", () => {
  beforeEach(() => {
    mockSettings.enableSpecialEpisodes = undefined;
    mockSettings.partialRequestsEnabled = undefined;
  });

  test("starts with nothing chosen, as Seerr's own modal", async () => {
    const { result } = await render();
    await waitFor(() => expect(result.current.unrequested).toEqual([2]));
    expect(result.current.selected).toEqual([]);
    expect(result.current.label).toBe("seerr.select_seasons");
    expect(result.current.blocked).toBe(true);
  });

  test("counts the seasons chosen in its button", async () => {
    const { result } = await render();
    await waitFor(() => expect(result.current.unrequested).toEqual([2]));
    await act(async () => result.current.toggle(2));
    await waitFor(() => expect(result.current.blocked).toBe(false));
    expect(result.current.selected).toEqual([2]);
    expect(result.current.label).toBe("seerr.request_n_seasons:1");
    expect(result.current.seasons).toEqual([2]);
  });

  test("offers the specials where the server shows them", async () => {
    mockSettings.enableSpecialEpisodes = true;
    const { result } = await render();
    await waitFor(() => expect(result.current.unrequested).toEqual([0, 2]));
  });

  test("asks for every season left on a whole-series server", async () => {
    mockSettings.partialRequestsEnabled = false;
    const { result } = await render();
    await waitFor(() => expect(result.current.blocked).toBe(false));
    expect(result.current.label).toBe("seerr.request_button");
    expect(result.current.seasons).toEqual([2]);
  });

  test("says when nothing is left to ask for, and stays off", async () => {
    const asked = {
      ...series,
      seasons: series.seasons.filter((season) => season.seasonNumber === 1),
    } as TvDetails;
    const { result } = await render({ details: asked });
    await waitFor(() =>
      expect(result.current.label).toBe("seerr.already_requested"),
    );
    expect(result.current.blocked).toBe(true);
  });

  // The phone keeps its sheet mounted between two requests: each new one
  // starts the switches over, even with no seasons of its own.
  test("starts over with each request it opens with", async () => {
    const { result, rerender } = await render({ opened: {} });
    await waitFor(() => expect(result.current.unrequested).toEqual([2]));
    await act(async () => result.current.toggle(2));
    expect(result.current.selected).toEqual([2]);
    await rerender({
      details: series,
      enabled: true,
      quotaUserId: 1,
      opened: {},
    });
    await waitFor(() => expect(result.current.selected).toEqual([]));
  });

  test("opens with every season left when asked for all of them", async () => {
    const { result } = await render({ opened: { seasons: "all" } });
    await waitFor(() => expect(result.current.selected).toEqual([2]));
  });
});
