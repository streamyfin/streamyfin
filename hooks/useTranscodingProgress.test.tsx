import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { makeApi } from "@/test-utils/jellyfinApi";
import { useTranscodingProgress } from "./useTranscodingProgress";

// One api for the file: the atom below is read once per Jotai store.
const mockApi = makeApi();

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(() => mockApi) };
});

const SESSIONS_URL = /\/Sessions\?/;

const renderProgress = async (enabled: boolean, itemId = "item-1") => {
  // No retry: it would keep Jest from exiting.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rendered = await renderHook(
    (props: { enabled: boolean; itemId: string }) =>
      useTranscodingProgress(props.enabled, props.itemId),
    {
      initialProps: { enabled, itemId },
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { ...rendered, client };
};

describe("useTranscodingProgress", () => {
  beforeEach(() => {
    mockApi.mock.reset();
    mockApi.mock.onGet(SESSIONS_URL).reply(200, [
      {
        Id: "session-1",
        TranscodingInfo: {
          CompletionPercentage: 12.5,
          Framerate: 48,
          HardwareAccelerationType: "nvenc",
        },
      },
    ]);
  });

  test("reads the transcode of this device's own session", async () => {
    const { result, unmount } = await renderProgress(true);

    await waitFor(() =>
      expect(result.current).toEqual({
        percent: "12.5",
        fps: "48",
        hardware: "nvenc",
      }),
    );
    // "device-1" is the id the test api was created with.
    expect(mockApi.mock.history.get[0].url).toContain("deviceId=device-1");
    await unmount();
  });

  // Direct play, or an overlay nobody is looking at: the server has nothing
  // to say and is not asked.
  test("asks nothing while it is not enabled", async () => {
    const { result, unmount } = await renderProgress(false);

    expect(result.current).toBeNull();
    expect(mockApi.mock.history.get).toHaveLength(0);
    await unmount();
  });

  test("forgets the progress once it is switched off", async () => {
    const { result, rerender, unmount } = await renderProgress(true);
    await waitFor(() => expect(result.current).not.toBeNull());

    await rerender({ enabled: false, itemId: "item-1" });

    expect(result.current).toBeNull();
    await unmount();
  });

  // Autoplay keeps the overlay up across episodes: the finished transcode's
  // 100% must not sit on the new one until the next poll lands.
  test("starts empty when the next item begins", async () => {
    const { result, rerender, unmount } = await renderProgress(true);
    await waitFor(() => expect(result.current).not.toBeNull());
    // The server takes its time to answer about the new item.
    mockApi.mock.reset();
    mockApi.mock.onGet(SESSIONS_URL).reply(() => new Promise(() => {}));

    await rerender({ enabled: true, itemId: "item-2" });

    expect(result.current).toBeNull();
    await unmount();
  });

  test("shows nothing when the poll fails", async () => {
    mockApi.mock.reset();
    mockApi.mock.onGet(SESSIONS_URL).reply(500);
    const { result, unmount } = await renderProgress(true);

    await waitFor(() => expect(mockApi.mock.history.get).toHaveLength(1));
    expect(result.current).toBeNull();
    await unmount();
  });
});
