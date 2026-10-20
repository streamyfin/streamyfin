import {
  MutationCache,
  onlineManager,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AxiosError, AxiosHeaders } from "axios";
import type React from "react";
import { MOST_AWAITED_TITLES } from "@/constants/Notifications";
import type { AwaitedTitle } from "@/utils/awaitedTitles";
import { reportDataError } from "@/utils/reportDataError";
import { AWAITED_TITLES_QUERY, useAwaitedTitles } from "./useAwaitedTitles";

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();
const mockToastError = jest.fn();
const mockCapture = jest.fn();

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
jest.mock("@sentry/react-native", () => ({
  withScope: (report: (scope: unknown) => void) =>
    report({ setContext: jest.fn(), setFingerprint: jest.fn() }),
  captureException: (...args: unknown[]) => mockCapture(...args),
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

// What axios rejects with when the plugin answers with this status.
const refused = (status: number, method: string) => {
  const config = {
    url: "https://jellyfin.example.com/Streamyfin/v1/notifications/mine/awaited",
    method,
    headers: new AxiosHeaders(),
  };
  return new AxiosError(
    `Request failed with status code ${status}`,
    "ERR_BAD_REQUEST",
    config,
    undefined,
    { status, statusText: "", data: "", headers: {}, config },
  );
};

// A server answer the test gives when it chooses.
const later = <T,>() => {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

// The cache and errors wired as the root layout wires them, so what reaches Sentry shows.
const reportingClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) =>
        reportDataError("query", query.queryKey, error),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        reportDataError("mutation", mutation.options.mutationKey, error),
    }),
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });

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
  afterEach(() => {
    client.clear();
    onlineManager.setOnline(true);
  });

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

  // Every phone on a server with the current plugin release asks once a session, and its
  // answer is no defect of the app.
  it("send the older plugin's 404 to nobody", async () => {
    client = reportingClient();
    mockGet.mockRejectedValue(refused(404, "get"));

    const { result } = await renderHook(() => useAwaitedTitles(), { wrapper });

    await waitFor(() => expect(result.current.supported).toBe(false));
    expect(mockCapture).not.toHaveBeenCalled();
  });

  // The plugin refuses a title that is already here, or one more than it keeps, on purpose:
  // the person is told, and Sentry has no defect to hear about.
  it.each([409, 400])(
    "send a refusal on purpose (%i) to nobody",
    async (status) => {
      client = reportingClient();
      mockPost.mockRejectedValue(refused(status, "post"));
      const { result } = await ready();

      await act(async () => {
        await result.current.add(inception);
      });

      expect(mockToastError).toHaveBeenCalled();
      expect(mockCapture).not.toHaveBeenCalled();
    },
  );

  // Offline with nothing kept, a read that waits for the network leaves the list blank;
  // failed at once, the screen can say so.
  it("fail at once offline", async () => {
    onlineManager.setOnline(false);
    client = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: Number.POSITIVE_INFINITY,
          networkMode: "offlineFirst",
        },
      },
    });
    mockGet.mockRejectedValue(new Error("Network Error"));

    const { result } = await renderHook(() => useAwaitedTitles(), { wrapper });

    await waitFor(() =>
      expect(
        client.getQueryState([
          AWAITED_TITLES_QUERY,
          "https://jellyfin.example.com",
          "alice",
        ])?.status,
      ).toBe("error"),
    );
    expect(result.current.titles).toBeUndefined();
  });

  // Where the plugin does not offer the event there is nothing to wait for, and nothing to
  // read on every Seerr page.
  it("read nothing when not asked to", async () => {
    await renderHook(() => useAwaitedTitles({ enabled: false }), { wrapper });
    await act(async () => {});

    expect(mockGet).not.toHaveBeenCalled();
  });

  // A disabled query still hands back what it kept, from an earlier session or before the
  // plugin stopped offering the event: that list is no longer the person's to see.
  it("show no list kept from before when not asked to read", async () => {
    client.setQueryData(
      [AWAITED_TITLES_QUERY, "https://jellyfin.example.com", "alice"],
      [matrix],
    );

    const { result } = await renderHook(
      () => useAwaitedTitles({ enabled: false }),
      { wrapper },
    );

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
    // The plugin also answers 400 for a title it cannot keep, which is not a full list.
    ["the plugin refuses the title", 400, "seerr.awaited.failed"],
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

  it("say the list is full when it is", async () => {
    const full = Array.from({ length: MOST_AWAITED_TITLES }, (_, i) => ({
      ...matrix,
      tmdbId: i + 1,
    }));
    mockGet.mockResolvedValue({ data: full });
    mockPost.mockRejectedValue(answered(400));
    const { result } = await ready();

    await act(async () => {
      await result.current.add(inception);
    });

    expect(mockToastError).toHaveBeenCalledWith("seerr.awaited.too_many");
  });

  // Each change is one title, sent after the one before has answered: in parallel, their
  // answers could land in either order and leave the list on the older one.
  it("send one change at a time, in the order they were made", async () => {
    const adding = later<{ data: AwaitedTitle[] }>();
    mockPost.mockImplementationOnce(() => adding.promise);
    mockDelete.mockResolvedValueOnce({ data: [inceptionSaved] });
    const { result } = await ready();

    const changes: Promise<void>[] = [];
    await act(async () => {
      changes.push(result.current.add(inception));
    });
    await act(async () => {
      changes.push(result.current.remove("movie", 603));
    });

    expect(mockDelete).not.toHaveBeenCalled();
    await act(async () => {
      adding.resolve({ data: [inceptionSaved, matrix] });
      await Promise.all(changes);
    });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(cached()).toEqual([inceptionSaved]);
  });

  // The first answer does not have the change still waiting: shown, it would put back the
  // title just taken off.
  it("show a change's answer only once no later one waits", async () => {
    const adding = later<{ data: AwaitedTitle[] }>();
    const removing = later<{ data: AwaitedTitle[] }>();
    mockPost.mockImplementationOnce(() => adding.promise);
    mockDelete.mockImplementationOnce(() => removing.promise);
    const { result } = await ready();

    const changes: Promise<void>[] = [];
    await act(async () => {
      changes.push(result.current.add(inception));
    });
    await act(async () => {
      changes.push(result.current.remove("movie", 603));
    });
    await act(async () => {
      adding.resolve({ data: [inceptionSaved, matrix] });
      await changes[0];
    });

    expect(cached()?.map((title) => title.tmdbId)).toEqual([27205]);
    await act(async () => {
      removing.resolve({ data: [inceptionSaved] });
      await changes[1];
    });
    expect(cached()).toEqual([inceptionSaved]);
  });

  // A read on its way when the person presses answers with the list from before: landing
  // after, it would turn the button back.
  it("keep a change that a read on its way would undo", async () => {
    const { result } = await ready();
    const reading = later<{ data: AwaitedTitle[] }>();
    mockGet.mockImplementationOnce(() => reading.promise);
    await act(async () => {
      void client.invalidateQueries({ queryKey: [AWAITED_TITLES_QUERY] });
    });
    const adding = later<{ data: AwaitedTitle[] }>();
    mockPost.mockImplementationOnce(() => adding.promise);

    let change: Promise<void> = Promise.resolve();
    await act(async () => {
      change = result.current.add(inception);
    });
    await act(async () => {
      reading.resolve({ data: [matrix] });
    });

    expect(cached()?.map((title) => title.tmdbId)).toEqual([27205, 603]);
    await act(async () => {
      adding.resolve({ data: [inceptionSaved, matrix] });
      await change;
    });
  });

  // Each change is one title of its own, so a later one does not carry an earlier one that
  // failed: the person is told at once, and the later answer shows what the server has.
  it("say an earlier change failed even while a later one waits", async () => {
    const adding = later<{ data: AwaitedTitle[] }>();
    mockPost.mockImplementationOnce(() => adding.promise);
    mockDelete.mockResolvedValueOnce({ data: [] });
    const { result } = await ready();

    const changes: Promise<void>[] = [];
    await act(async () => {
      changes.push(result.current.add(inception));
    });
    await act(async () => {
      changes.push(result.current.remove("movie", 603));
    });
    await act(async () => {
      adding.reject(answered(500));
      await Promise.all(changes);
    });

    expect(mockToastError).toHaveBeenCalledWith("seerr.awaited.failed");
    expect(cached()).toEqual([]);
  });
});
