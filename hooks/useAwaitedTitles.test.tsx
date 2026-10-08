import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type React from "react";
import type { AwaitedTitle } from "@/utils/awaitedTitles";
import { AWAITED_TITLES_QUERY, useAwaitedTitles } from "./useAwaitedTitles";

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();
const mockToastError = jest.fn();

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({
      basePath: "https://jellyfin.example.com",
      get: (...args: unknown[]) => mockGet(...args),
      post: (...args: unknown[]) => mockPost(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    }),
    userAtom: atom({ Id: "alice" }),
  };
});
jest.mock("sonner-native", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let client: QueryClient;

// What the cache holds, which the screen shows once it renders.
const cached = () =>
  client.getQueryData<AwaitedTitle[]>([
    AWAITED_TITLES_QUERY,
    "https://jellyfin.example.com",
    "alice",
  ]);

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const matrix: AwaitedTitle = {
  mediaType: "movie",
  tmdbId: 603,
  title: "The Matrix",
  year: 1999,
  addedAt: "2026-10-08T08:00:00Z",
  arrived: false,
};
const inception = {
  mediaType: "movie",
  tmdbId: 27205,
  title: "Inception",
  year: 2010,
} as const;
const inceptionSaved: AwaitedTitle = {
  ...inception,
  addedAt: "2026-10-08T09:00:00Z",
  arrived: false,
};

const answered = (status: number) => ({ response: { status } });

const ready = async () => {
  const hook = await renderHook(() => useAwaitedTitles(), { wrapper });
  await waitFor(() => expect(hook.result.current.titles).toBeDefined());
  return hook;
};

describe("the titles the person waits for", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // No garbage collection timer nor retry: either keeps Jest from exiting.
    client = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
        mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });
    mockGet.mockResolvedValue({ data: [matrix] });
  });
  afterEach(() => client.clear());

  // A plugin from before #225 has no such route: nothing is offered, and nothing is said.
  it("are unsupported when the plugin does not know the route", async () => {
    mockGet.mockRejectedValue(answered(404));

    const { result } = await renderHook(() => useAwaitedTitles(), { wrapper });

    await waitFor(() => expect(result.current.supported).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  // The query keeps what it read when a later read fails, so a plugin that loses the route
  // would otherwise leave the old list on the screen, with nothing to take it off.
  it("drop the list they had once the route goes away", async () => {
    const { result } = await ready();

    mockGet.mockRejectedValue(answered(404));
    await act(async () => {
      await client.refetchQueries({ queryKey: [AWAITED_TITLES_QUERY] });
    });

    await waitFor(() => expect(result.current.supported).toBe(false));
    expect(result.current.titles).toBeUndefined();
    expect(result.current.isAwaited("movie", 603)).toBe(false);
  });

  it("know a title by its kind and its TMDB id", async () => {
    const { result } = await ready();

    expect(result.current.supported).toBe(true);
    expect(result.current.isAwaited("movie", 603)).toBe(true);
    expect(result.current.isAwaited("tv", 603)).toBe(false);
  });

  // The button moves at once, and the server's list replaces the guess when it answers.
  it("show a title added before the server answers", async () => {
    let answer: (value: unknown) => void = () => {};
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const { result } = await ready();

    let adding: Promise<void> = Promise.resolve();
    await act(async () => {
      adding = result.current.add(inception);
    });
    expect(cached()?.map((title) => title.tmdbId)).toEqual([27205, 603]);

    await act(async () => {
      answer({ data: [inceptionSaved, matrix] });
      await adding;
    });
    expect(cached()).toEqual([inceptionSaved, matrix]);
  });

  it("take a title off before the server answers", async () => {
    mockDelete.mockResolvedValue({ data: [] });
    const { result } = await ready();

    await act(async () => {
      await result.current.remove("movie", 603);
    });

    expect(mockDelete).toHaveBeenCalledWith(
      "/Streamyfin/v1/notifications/mine/awaited/movie/603",
    );
    expect(cached()).toEqual([]);
  });

  it.each([
    ["the title is already on the server", 409, "seerr.awaited.already_here"],
    [
      "the person waits for as many titles as they can",
      400,
      "seerr.awaited.too_many",
    ],
    ["something else went wrong", 500, "seerr.awaited.failed"],
  ])("go back and say so when %s", async (_case, status, message) => {
    mockPost.mockRejectedValue(answered(status));
    const { result } = await ready();

    await act(async () => {
      await result.current.add(inception);
    });

    await waitFor(() => expect(cached()).toEqual([matrix]));
    expect(mockToastError).toHaveBeenCalledWith(message);
  });

  // An earlier change failing late must not undo a later one the server already kept.
  it("keep what a later change saved when an earlier one fails", async () => {
    let failFirst: (error: unknown) => void = () => {};
    mockPost.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          failFirst = reject;
        }),
    );
    mockDelete.mockResolvedValueOnce({ data: [inceptionSaved] });
    const { result } = await ready();

    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.add(inception);
    });
    await act(async () => {
      await result.current.remove("movie", 603);
    });
    mockGet.mockRejectedValue(new Error("offline"));
    await act(async () => {
      failFirst(answered(500));
      await first;
    });

    expect(cached()).toEqual([inceptionSaved]);
    expect(mockToastError).toHaveBeenCalledWith("seerr.awaited.failed");
  });
});
