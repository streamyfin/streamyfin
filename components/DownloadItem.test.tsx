import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { toast } from "sonner-native";
import { getDownloadStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { DownloadSingleItem } from "./DownloadItem";

const mockStartBackgroundDownload = jest.fn();

jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    processes: [],
    downloadedItems: [],
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
