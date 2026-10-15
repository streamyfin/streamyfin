import {
  onlineManager,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AxiosError, AxiosHeaders } from "axios";
import type React from "react";
import { MY_NOTIFICATIONS_QUERY } from "@/constants/Notifications";
import {
  type MyNotifications,
  toUpdate,
  withEvent,
  withFollow,
} from "@/utils/notificationPreferences";
import { reportDataError } from "@/utils/reportDataError";
import { useMyNotifications } from "./useMyNotifications";

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockToastError = jest.fn();
const mockCapture = jest.fn();

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({
      basePath: "https://jellyfin.example.com",
      get: (...args: unknown[]) => mockGet(...args),
      put: (...args: unknown[]) => mockPut(...args),
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

// What the cache holds, which the screen shows once it renders. A rendered value can still
// be the one from before a change, so a test that has to see a change undone reads this.
const cached = () =>
  client.getQueryData<MyNotifications>([
    MY_NOTIFICATIONS_QUERY,
    "https://jellyfin.example.com",
    "alice",
  ]);

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

// A server answer the test gives when it chooses.
const later = <T,>() => {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

// What axios rejects with when a plugin without the route answers.
const notFound = () => {
  const config = {
    url: "https://jellyfin.example.com/Streamyfin/v1/notifications/mine",
    method: "get",
    headers: new AxiosHeaders(),
  };
  return new AxiosError(
    "Request failed with status code 404",
    "ERR_BAD_REQUEST",
    config,
    undefined,
    { status: 404, statusText: "Not Found", data: "", headers: {}, config },
  );
};

const mine: MyNotifications = {
  pause: null,
  events: [{ key: "itemAdded", family: "new-content", enabled: true }],
  libraries: [],
  follow: { favorites: true, started: true },
  mutedShows: [],
};
// Two switches moved one after the other: the first, then both.
const one = withEvent(mine, "itemAdded", false);
const both = withFollow(one, { favorites: false, started: true });

describe("the person's notification choices", () => {
  beforeEach(() => {
    // Implementations too, so what one test told the server to answer stays in it.
    jest.resetAllMocks();
    // No garbage collection timer nor retry: either keeps Jest from exiting.
    client = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
        mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });
  });
  // The hook retries a failed read on its own, and a retry left running would answer in the
  // next test.
  afterEach(() => {
    client.clear();
    onlineManager.setOnline(true);
  });

  // A plugin without the route hides the screen, silently.
  it("are unsupported when the plugin does not know the route", async () => {
    mockGet.mockRejectedValue({ response: { status: 404 } });

    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.supported).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  // Every phone on a server with the current plugin release asks once a session, and its
  // answer is no defect of the app. Wired as the root layout wires the reporting.
  it("send the older plugin's 404 to nobody", async () => {
    client = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) =>
          reportDataError("query", query.queryKey, error),
      }),
      defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
    });
    mockGet.mockRejectedValue(notFound());

    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.supported).toBe(false));
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("are supported once the plugin answers", async () => {
    mockGet.mockResolvedValue({ data: mine });

    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.mine).toEqual(mine));
    expect(result.current.supported).toBe(true);
  });

  // Offline with nothing kept, a read that waits for the network leaves the screen blank;
  // failed at once, it says so and offers to try again. Set up as the app sets its queries.
  it("fail at once offline, so the screen can offer to try again", async () => {
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

    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  // A change the server refuses comes back, and says so.
  it("go back to what they were when a change fails", async () => {
    mockGet.mockResolvedValue({ data: mine });
    mockPut.mockRejectedValue(new Error("offline"));

    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.mine).toBeDefined());

    await act(async () => {
      await result.current.update(one);
    });

    await waitFor(() =>
      expect(result.current.mine?.events[0].enabled).toBe(true),
    );
    expect(mockToastError).toHaveBeenCalledWith(
      "home.settings.notifications.save_failed",
    );
  });

  // Offline, the server cannot be asked what it kept either, so the snapshot is what the
  // screen goes back to.
  it("go back to what they were when a change fails and the server cannot be asked", async () => {
    mockGet.mockResolvedValue({ data: mine });
    mockPut.mockRejectedValue(new Error("offline"));

    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.mine).toBeDefined());
    mockGet.mockRejectedValue(new Error("offline"));

    await act(async () => {
      await result.current.update(one);
    });

    expect(cached()).toEqual(mine);
  });

  // A read on its way when a switch moves answers with what the server had before. Landing
  // after, it would put the switch back, and the next switch would send it so.
  it("keep a switch that a read on its way would undo", async () => {
    mockGet.mockResolvedValueOnce({ data: mine });
    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.mine).toBeDefined());
    const read = later<{ data: MyNotifications }>();
    mockGet.mockImplementationOnce(() => read.promise);
    await act(async () => {
      void client.invalidateQueries({ queryKey: [MY_NOTIFICATIONS_QUERY] });
    });
    const saved = later<{ data: MyNotifications }>();
    mockPut.mockImplementationOnce(() => saved.promise);

    let change: Promise<void> = Promise.resolve();
    await act(async () => {
      change = result.current.update(one);
    });
    await act(async () => {
      read.resolve({ data: mine });
    });

    expect(cached()).toEqual(one);
    await act(async () => {
      saved.resolve({ data: one });
      await change;
    });
  });

  // Each change replaces what the plugin stores. Sent together, they can land in either
  // order; one after the other, the later carries the earlier.
  it("send one change at a time, in the order the switches moved", async () => {
    mockGet.mockResolvedValue({ data: mine });
    const first = later<{ data: MyNotifications }>();
    mockPut
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ data: both });
    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.mine).toBeDefined());

    const changes: Promise<void>[] = [];
    await act(async () => {
      changes.push(result.current.update(one));
    });
    await act(async () => {
      changes.push(result.current.update(both));
    });

    expect(mockPut).toHaveBeenCalledTimes(1);
    await act(async () => {
      first.resolve({ data: one });
      await Promise.all(changes);
    });
    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(mockPut.mock.calls[1][1]).toEqual(toUpdate(both));
  });

  // The first answer does not have the change still waiting. Shown, it would put that
  // switch back, and the next switch would send it so.
  it("show a change's answer only once no later one waits", async () => {
    // Another device turned a show off meanwhile, which only the last answer has.
    const bothSaved = { ...both, mutedShows: [{ id: "show", name: "Show" }] };
    mockGet.mockResolvedValue({ data: mine });
    const first = later<{ data: MyNotifications }>();
    const second = later<{ data: MyNotifications }>();
    mockPut
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.mine).toBeDefined());

    const changes: Promise<void>[] = [];
    await act(async () => {
      changes.push(result.current.update(one));
    });
    await act(async () => {
      changes.push(result.current.update(both));
    });
    await act(async () => {
      first.resolve({ data: one });
      await changes[0];
    });

    expect(cached()).toEqual(both);
    await act(async () => {
      second.resolve({ data: bothSaved });
      await changes[1];
    });
    expect(cached()).toEqual(bothSaved);
  });

  // The later change carries the earlier one to the server, so the earlier failing says
  // nothing yet: what the later one gets decides.
  it("leave a failed change to the later one that carries it", async () => {
    mockGet.mockResolvedValue({ data: mine });
    const first = later<{ data: MyNotifications }>();
    mockPut
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ data: both });
    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.mine).toBeDefined());

    const changes: Promise<void>[] = [];
    await act(async () => {
      changes.push(result.current.update(one));
    });
    await act(async () => {
      changes.push(result.current.update(both));
    });
    await act(async () => {
      first.reject(new Error("timeout"));
      await Promise.all(changes);
    });

    expect(cached()).toEqual(both);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  // Neither change was saved, so the screen goes back to what the server has, and not to
  // the first change, which the next switch would then send.
  it("go back to what the server has when the last change fails too", async () => {
    mockGet.mockResolvedValue({ data: mine });
    const first = later<{ data: MyNotifications }>();
    mockPut
      .mockImplementationOnce(() => first.promise)
      .mockRejectedValueOnce(new Error("timeout"));
    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.mine).toBeDefined());

    const changes: Promise<void>[] = [];
    await act(async () => {
      changes.push(result.current.update(one));
    });
    await act(async () => {
      changes.push(result.current.update(both));
    });
    mockGet.mockRejectedValue(new Error("offline"));
    await act(async () => {
      first.reject(new Error("timeout"));
      await Promise.all(changes);
    });

    expect(cached()).toEqual(mine);
    expect(mockToastError).toHaveBeenCalledTimes(1);
  });

  // The first change was saved, and its answer is the newest the server said.
  it("go back to the earlier change's answer when only the last one fails", async () => {
    const oneSaved = { ...one, mutedShows: [{ id: "show", name: "Show" }] };
    mockGet.mockResolvedValue({ data: mine });
    const first = later<{ data: MyNotifications }>();
    mockPut
      .mockImplementationOnce(() => first.promise)
      .mockRejectedValueOnce(new Error("timeout"));
    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.mine).toBeDefined());

    const changes: Promise<void>[] = [];
    await act(async () => {
      changes.push(result.current.update(one));
    });
    await act(async () => {
      changes.push(result.current.update(both));
    });
    mockGet.mockRejectedValue(new Error("offline"));
    await act(async () => {
      first.resolve({ data: oneSaved });
      await Promise.all(changes);
    });

    expect(cached()).toEqual(oneSaved);
    expect(mockToastError).toHaveBeenCalledTimes(1);
  });
});
