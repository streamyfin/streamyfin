import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { toast } from "sonner-native";
import { getDownloadStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { DownloadItems, DownloadSingleItem } from "./DownloadItem";

const mockStartBackgroundDownload = jest.fn();
let mockDownloadedItems: { item: BaseItemDto }[] = [];

jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    processes: [],
    downloadedItems: mockDownloadedItems,
    startBackgroundDownload: mockStartBackgroundDownload,
  }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://server", accessToken: "token" }),
    userAtom: atom({
      Id: "user-1",
      Policy: { EnableContentDownloading: true },
    }),
  };
});
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: null }),
}));
jest.mock("@/utils/jellyfin/media/getStreamUrl", () => ({
  getDownloadStreamUrl: jest.fn(),
}));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: jest.fn() }),
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
jest.mock("i18next", () => ({ t: (key: string) => key }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("sonner-native", () => ({ toast: { error: jest.fn() } }));
// The sheet is always open here: what is under test is what confirming it
// does, not how it is presented.
jest.mock("@gorhom/bottom-sheet", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");
  return {
    BottomSheetModal: forwardRef(
      (
        { children }: { children: React.ReactNode },
        ref: React.Ref<unknown>,
      ) => {
        useImperativeHandle(ref, () => ({ present() {}, dismiss() {} }));
        return children;
      },
    ),
    BottomSheetView: ({ children }: { children: React.ReactNode }) => children,
    BottomSheetBackdrop: () => null,
  };
});
jest.mock("@/components/common/HeaderIcon", () => ({ HeaderIcon: () => null }));
jest.mock("./PlatformDropdown", () => ({ PlatformDropdown: () => null }));

const MOVIE: BaseItemDto = {
  Id: "movie-1",
  Type: "Movie",
  Name: "Movie",
  // Present, so the download does not go and fetch the item again.
  Chapters: [],
};

/** An episode whose source and default tracks are told apart by its number. */
const episode = (number: number): BaseItemDto => ({
  Id: `episode-${number}`,
  Type: "Episode",
  Name: `Episode ${number}`,
  Chapters: [],
  MediaSources: [
    {
      Id: `source-${number}`,
      DefaultAudioStreamIndex: number,
      DefaultSubtitleStreamIndex: number + 10,
      MediaStreams: [],
    },
  ],
});

const renderSeasonDownload = (items: BaseItemDto[]) =>
  render(
    <DownloadItems
      items={items}
      MissingDownloadIconComponent={() => <></>}
      DownloadedIconComponent={() => <></>}
    />,
  );

/** Presses Download in the sheet and lets the wait for its dismissal pass. */
const confirmDownload = async () => {
  await fireEvent.press(screen.getByText("item_card.download.download_button"));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(300);
  });
};

describe("DownloadSingleItem", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockDownloadedItems = [];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Sentry REACT-NATIVE-FX: the server lists no media source for some items (a
  // missing episode is one). Confirming the sheet threw "No api or user or
  // item" where nobody caught it, so the user saw nothing happen and the app
  // reported an error of its own.
  test("tells the user when the item has no media source to download", async () => {
    await render(<DownloadSingleItem item={{ ...MOVIE, MediaSources: [] }} />);

    await confirmDownload();

    expect(toast.error).toHaveBeenCalledWith(
      "home.downloads.toasts.no_media_source_to_download",
    );
    expect(getDownloadStreamUrl).not.toHaveBeenCalled();
    expect(mockStartBackgroundDownload).not.toHaveBeenCalled();
  });

  test("starts the download of an item that has a media source", async () => {
    const mediaSource = { Id: "source-1", MediaStreams: [] };
    jest.mocked(getDownloadStreamUrl).mockResolvedValue({
      url: "http://server/download",
      sessionId: null,
      mediaSource,
    });
    await render(
      <DownloadSingleItem item={{ ...MOVIE, MediaSources: [mediaSource] }} />,
    );

    await confirmDownload();

    expect(toast.error).not.toHaveBeenCalled();
    expect(getDownloadStreamUrl).toHaveBeenCalledWith(
      expect.objectContaining({ mediaSourceId: "source-1" }),
    );
    expect(mockStartBackgroundDownload).toHaveBeenCalledTimes(1);
  });
});

describe("DownloadItems, with one episode of a season left to download", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockDownloadedItems = [];
    jest.mocked(getDownloadStreamUrl).mockResolvedValue({
      url: "http://server/download",
      sessionId: null,
      mediaSource: { Id: "source", MediaStreams: [] },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // The sheet took its source and tracks from the first episode of the list
  // while the one left to download was another, so the server was asked for
  // that episode with a media source id that belongs to a different one.
  test("downloads it with its own media source and default tracks", async () => {
    mockDownloadedItems = [{ item: episode(1) }];
    await renderSeasonDownload([episode(1), episode(2)]);

    await confirmDownload();

    expect(getDownloadStreamUrl).toHaveBeenCalledTimes(1);
    expect(getDownloadStreamUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ Id: "episode-2" }),
        mediaSourceId: "source-2",
        audioStreamIndex: 2,
        subtitleStreamIndex: 12,
      }),
    );
    expect(mockStartBackgroundDownload).toHaveBeenCalledWith(
      "http://server/download",
      expect.objectContaining({ Id: "episode-2" }),
      expect.anything(),
      expect.anything(),
      2,
      12,
    );
  });

  // The first episode can be downloaded and no longer have a source on the
  // server (its file was removed there). That is not the episode being asked
  // for, so it must not turn the download down.
  test("is not turned down because the first episode has no media source", async () => {
    const downloaded = { ...episode(1), MediaSources: [] };
    mockDownloadedItems = [{ item: downloaded }];
    await renderSeasonDownload([downloaded, episode(2)]);

    await confirmDownload();

    expect(toast.error).not.toHaveBeenCalled();
    expect(getDownloadStreamUrl).toHaveBeenCalledWith(
      expect.objectContaining({ mediaSourceId: "source-2" }),
    );
    expect(mockStartBackgroundDownload).toHaveBeenCalledTimes(1);
  });

  // "Unwatched only" narrows what is sent, not what is pending: the sheet
  // offers no source or tracks then, and each episode resolves its own.
  test("left by the unwatched only switch, downloads it with its own media source", async () => {
    const watched = { ...episode(1), UserData: { Played: true } };
    await renderSeasonDownload([watched, episode(2)]);

    await fireEvent(screen.getByRole("switch"), "valueChange", true);
    await confirmDownload();

    expect(getDownloadStreamUrl).toHaveBeenCalledTimes(1);
    expect(getDownloadStreamUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ Id: "episode-2" }),
        mediaSourceId: "source-2",
        audioStreamIndex: 2,
        subtitleStreamIndex: 12,
      }),
    );
  });
});
