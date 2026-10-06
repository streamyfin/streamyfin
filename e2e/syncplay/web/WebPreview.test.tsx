import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type {
  MpvPlayerViewProps,
  MpvPlayerViewRef,
} from "@/modules/mpv-player/src/MpvPlayer.types";
import type {
  SyncPlayLauncher,
  SyncPlayLaunchRequest,
  SyncPlayPlayerAdapter,
} from "@/utils/syncplay/types";
import { WebPreview } from "./WebPreview";

const mockApi = {
  basePath: "http://localhost:8096",
  accessToken: "test-token",
};
const mockGetItem = jest.fn();
const mockPause = jest.fn();
const mockReportStopped = jest.fn();
const mockReportStarted = jest.fn();
const mockReportProgress = jest.fn();
const mockTranslate = (key: string) => key;
let mockLauncher: SyncPlayLauncher;
let mockPlayer: SyncPlayPlayerAdapter;
let mockVideoProps: MpvPlayerViewProps;
let mockMountCount = 0;

const mockSync = {
  enabled: true,
  connected: true,
  busy: false,
  registerLauncher: jest.fn((launcher: SyncPlayLauncher) => {
    mockLauncher = launcher;
    return jest.fn();
  }),
  registerPlayer: jest.fn((player: SyncPlayPlayerAdapter) => {
    mockPlayer = player;
    return jest.fn();
  }),
  notifyReady: jest.fn(),
  notifyBuffering: jest.fn(),
  notifyProgress: jest.fn(),
  notifyEnded: jest.fn(),
};

jest.mock("@jellyfin/sdk", () => ({
  Jellyfin: jest.fn().mockImplementation(() => ({ createApi: () => mockApi })),
}));
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getUserApi: () => ({
    authenticateUserByName: async () => ({
      data: { AccessToken: "test-token", User: { Id: "user", Name: "Tester" } },
    }),
  }),
  getItemsApi: () => ({ getItems: async () => ({ data: { Items: [] } }) }),
  getUserLibraryApi: () => ({ getItem: mockGetItem }),
  getPlaystateApi: () => ({
    reportPlaybackStopped: mockReportStopped,
    reportPlaybackStart: mockReportStarted,
    reportPlaybackProgress: mockReportProgress,
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockTranslate }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/i18n", () => ({ __esModule: true, default: {} }));
jest.mock("@/components/syncplay/SyncPlayManager", () => ({
  SyncPlayManager: () => null,
}));
jest.mock("@/providers/SyncPlayProvider.web", () => ({
  SyncPlayProvider: ({ children }: { children: React.ReactNode }) => children,
  useSyncPlay: () => mockSync,
}));
jest.mock("@/modules/mpv-player/src/MpvPlayerView.web", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: React.forwardRef<MpvPlayerViewRef, MpvPlayerViewProps>(
      function MockVideo(props, ref) {
        React.useState(() => ++mockMountCount);
        mockVideoProps = props;
        React.useImperativeHandle(
          ref,
          () =>
            ({
              pause: mockPause,
              play: jest.fn(),
              seekTo: jest.fn(),
            }) as unknown as MpvPlayerViewRef,
          [],
        );
        React.useEffect(() => {
          props.onLoad?.({ nativeEvent: { url: props.source?.url ?? "" } });
          props.onPlaybackStateChange?.({
            nativeEvent: {
              isPlaying: false,
              isLoading: false,
              isReadyToSeek: true,
            },
          });
        }, []);
        return (
          <View
            testID='mock-web-video'
            accessibilityLabel={props.source?.url}
          />
        );
      },
    ),
  };
});

const movie = (id: string): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: "Movie",
  MediaSources: [{ Id: `${id}-source` }],
});
const request = (itemId: string): SyncPlayLaunchRequest => ({
  itemId,
  playlistItemId: `playlist-${itemId}`,
  startPositionTicks: 0,
  isCurrent: () => true,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const login = async () => {
  await render(<WebPreview />);
  await fireEvent.changeText(screen.getByTestId("web-username"), "tester");
  await fireEvent.press(screen.getByTestId("web-login"));
};
const launch = async (id: string) => {
  await act(async () => {
    await mockLauncher(request(id));
  });
};

describe("browser SyncPlay playback lifecycle", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: { getItem: () => "browser-device", setItem: jest.fn() },
    });
    mockGetItem.mockReset().mockImplementation(async ({ itemId }) => ({
      data: movie(itemId),
    }));
    mockPause.mockReset().mockResolvedValue(undefined);
    mockReportStopped.mockReset().mockResolvedValue(undefined);
    mockReportStarted.mockReset().mockResolvedValue(undefined);
    mockReportProgress.mockReset().mockResolvedValue(undefined);
    mockSync.notifyReady.mockClear();
    mockMountCount = 0;
  });

  test("relaunches the same URL only after lookup commits, then reports ready", async () => {
    await login();
    await launch("movie-a");
    expect(mockMountCount).toBe(1);
    expect(mockPlayer.getState().isReady).toBe(true);
    const firstUrl = mockVideoProps.source?.url;
    const lookup = deferred<{ data: BaseItemDto }>();
    mockGetItem.mockImplementationOnce(() => lookup.promise);
    let pending!: Promise<void>;
    await act(async () => {
      pending = Promise.resolve(mockLauncher(request("movie-a")));
    });

    await act(async () => {
      mockVideoProps.onProgress?.({
        nativeEvent: {
          position: 3,
          duration: 100,
          progress: 0.03,
          cacheSeconds: 5,
        },
      });
    });
    expect(mockMountCount).toBe(1);
    await act(async () => {
      lookup.resolve({ data: movie("movie-a") });
      await pending;
    });

    expect(mockMountCount).toBe(2);
    expect(mockVideoProps.source?.url).toBe(firstUrl);
    expect(mockPlayer.getState()).toEqual(
      expect.objectContaining({ itemId: "movie-a", isReady: true }),
    );
    expect(mockSync.notifyReady).toHaveBeenCalledTimes(2);
  });

  test("a delayed stop reports the old item without clearing a newer launch", async () => {
    await login();
    await launch("movie-a");
    await act(async () => {
      mockVideoProps.onProgress?.({
        nativeEvent: {
          position: 3,
          duration: 100,
          progress: 0.03,
          cacheSeconds: 5,
        },
      });
    });
    const paused = deferred<void>();
    mockPause.mockImplementationOnce(() => paused.promise);
    let stopping!: Promise<void>;
    await act(async () => {
      stopping = Promise.resolve(mockPlayer.stop());
    });
    await launch("movie-b");
    await act(async () => {
      paused.resolve(undefined);
      await stopping;
    });

    expect(screen.getByTestId("mock-web-video")).toBeTruthy();
    expect(mockPlayer.getState()).toEqual(
      expect.objectContaining({ itemId: "movie-b", isReady: true }),
    );
    expect(mockReportStopped).toHaveBeenCalledTimes(1);
    expect(mockReportStopped).toHaveBeenCalledWith({
      playbackStopInfo: {
        ItemId: "movie-a",
        MediaSourceId: "movie-a-source",
        PositionTicks: 30_000_000,
      },
    });
  });

  test("a lookup completing after stop cannot resurrect playback", async () => {
    await login();
    const lookup = deferred<{ data: BaseItemDto }>();
    mockGetItem.mockImplementationOnce(() => lookup.promise);
    let pending!: Promise<void>;
    await act(async () => {
      pending = Promise.resolve(mockLauncher(request("movie-a")));
    });
    await act(async () => {
      await mockPlayer.stop();
      lookup.resolve({ data: movie("movie-a") });
      await pending;
    });

    expect(screen.queryByTestId("mock-web-video")).toBeNull();
    expect(mockPlayer.getState()).toEqual({
      itemId: null,
      positionTicks: 0,
      isPlaying: false,
      isReady: false,
      isBuffering: false,
    });
    expect(mockReportStarted).not.toHaveBeenCalled();
  });
});
