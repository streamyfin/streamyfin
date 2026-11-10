// Spec for app/(auth)/tv-subtitle-modal.tsx and the hook that opens it. It
// lives here rather than next to the page because Expo Router turns every file
// under app/ into a route.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react-native";
import { Provider } from "jotai";
import { Pressable, Text } from "react-native";
import TVSubtitleModal from "@/app/(auth)/tv-subtitle-modal";
import { TVSheetTiming } from "@/constants/TVSheet";
import { useTVSubtitleModal } from "@/hooks/useTVSubtitleModal";
import { store } from "@/utils/store";

/** What reached the router and the caller, in order. */
const mockCalls: string[] = [];
const mockRouter = {
  back: jest.fn(() => {
    mockCalls.push("back");
  }),
  push: jest.fn(),
};
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => mockRouter,
}));
/** The sheet's back and menu handler, as it last handed it over. */
let mockBackPress: () => boolean | null | undefined = () => false;
jest.mock("@/hooks/useTVBackPress", () => ({
  useTVBackPress: (handler: () => boolean | null | undefined) => {
    mockBackPress = handler;
  },
}));
/** How many times one press fires onPress, to stand for a remote that fires twice. */
let mockSelectFires = 1;
// The track cards are React Native Pressables inside the sheet, so the double
// is the Pressable itself: one press calls onPress mockSelectFires times.
jest.mock("react-native/Libraries/Components/Pressable/Pressable", () => {
  const { createElement, forwardRef } = jest.requireActual("react");
  const Pressable = jest.requireActual(
    "react-native/Libraries/Components/Pressable/Pressable",
  ).default;
  return {
    __esModule: true,
    default: forwardRef(
      (props: { onPress?: (event: unknown) => void }, ref: unknown) =>
        createElement(Pressable, {
          ...props,
          ref,
          onPress:
            props.onPress &&
            ((event: unknown) => {
              for (let fire = 0; fire < mockSelectFires; fire++)
                props.onPress?.(event);
            }),
        }),
    ),
  };
});
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The real scale and settings read the settings atom, which loads the whole
// settings UI.
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 20, body: 18, heading: 28 }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {}, updateSettings: () => {} }),
}));
// The real focus animation pulls the provider tree in.
const MockTabButton = (props: { label: string; onSelect: () => void }) => (
  <Pressable onPress={props.onSelect}>
    <Text>{props.label}</Text>
  </Pressable>
);
jest.mock("@/components/tv", () => ({
  TVTabButton: (props: { label: string; onSelect: () => void }) =>
    MockTabButton(props),
  useTVFocusAnimation: () => ({
    focused: false,
    handleFocus: () => {},
    handleBlur: () => {},
    animatedStyle: {},
  }),
}));
const mockDownload = jest.fn(
  async (_result: { id: string }): Promise<{ type: string; path: string }> => ({
    type: "local",
    path: "/subtitles/movie.fr.srt",
  }),
);
const frenchResult = {
  id: "result-1",
  name: "Movie.FR.srt",
  providerName: "OpenSubtitles",
  format: "srt",
  language: "fre",
};
/** What a subtitle search finds. */
let mockSearchResults = [frenchResult];
jest.mock("@/hooks/useRemoteSubtitles", () => ({
  useRemoteSubtitles: () => ({
    hasOpenSubtitlesApiKey: true,
    isSearching: false,
    searchError: null,
    searchResults: mockSearchResults,
    search: () => {},
    downloadAsync: (result: { id: string }) => mockDownload(result),
    reset: () => {},
  }),
}));

const openSheet = async (
  deferApplyUntilDismissed: boolean,
  setTrack = () => {
    mockCalls.push("select French");
  },
) => {
  const { result } = await renderHook(() => useTVSubtitleModal());
  await act(async () => {
    result.current.showSubtitleModal({
      item: { Id: "movie-1", Name: "Movie" } as BaseItemDto,
      subtitleTracks: [
        {
          name: "French - SRT",
          index: 3,
          setTrack,
        },
      ],
      currentSubtitleIndex: -1,
      deferApplyUntilDismissed,
      onLocalSubtitleDownloaded: (path: string) => {
        mockCalls.push(`added ${path}`);
      },
      // The player passes it: the sheet stays open after a download.
      refreshSubtitleTracks: async () => [],
    });
  });
  // The app reads its atoms from this store, through the provider at its root.
  await render(
    <Provider store={store}>
      <TVSubtitleModal />
    </Provider>,
  );
  // The sheet lays out, then mounts the tab content.
  await act(async () => {
    jest.advanceTimersByTime(TVSheetTiming.contentDelayMs);
  });
  await act(async () => {
    jest.advanceTimersByTime(TVSheetTiming.tabContentDelayMs);
  });
};

describe("TV subtitle sheet", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCalls.length = 0;
    mockSelectFires = 1;
    mockDownload.mockClear();
    mockSearchResults = [frenchResult];
  });
  afterEach(() => jest.useRealTimers());

  // In the player a track can navigate (a burn-in switch while transcoding
  // replaces the player), which the sheet's route would swallow: the sheet
  // closes first and the track lands right after the press.
  test("closes first and applies a navigating track once the press has returned", async () => {
    await openSheet(true);

    const pressed = fireEvent.press(screen.getByText("French - SRT"));
    expect(mockCalls).toEqual(["back"]);

    await pressed;
    expect(mockCalls).toEqual(["back", "select French"]);
  });

  // On the detail page a track only updates state, applied while the sheet is
  // still up so TV focus does not jump after it closes.
  test("applies a state-only track before closing", async () => {
    await openSheet(false);

    await fireEvent.press(screen.getByText("French - SRT"));
    expect(mockCalls).toEqual(["select French", "back"]);
  });

  // One remote select on Android TV can fire onPress twice in the same JS
  // batch (react-native-tvos#110/#138, see useAppRouter), before React renders
  // the closed sheet. A second router.back() would pop the player under the
  // sheet as well.
  test("closes and applies once when one select fires twice", async () => {
    mockSelectFires = 2;
    await openSheet(true);

    await fireEvent.press(screen.getByText("French - SRT"));
    expect(mockCalls).toEqual(["back", "select French"]);
  });

  test("closes and applies once when one select fires twice on a state-only sheet", async () => {
    mockSelectFires = 2;
    await openSheet(false);

    await fireEvent.press(screen.getByText("French - SRT"));
    expect(mockCalls).toEqual(["select French", "back"]);
  });

  // The sheet stays open after a download, so closing cannot guard it: the
  // second press would download and add the same subtitle twice.
  test("downloads once when one select fires twice on a search result", async () => {
    await openSheet(true);
    await fireEvent.press(screen.getByText("player.download"));
    await act(async () => {
      jest.advanceTimersByTime(TVSheetTiming.tabContentDelayMs);
    });

    mockSelectFires = 2;
    await act(async () => {
      await fireEvent.press(screen.getByText("Movie.FR.srt"));
    });
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockCalls).toEqual(["added /subtitles/movie.fr.srt"]);
  });

  // Presses on the other results are dropped while one downloads, five
  // seconds or more for a server-side one: they look it, so the remote does
  // not seem to be ignored.
  test("shows the other results as unavailable while one downloads", async () => {
    mockSearchResults = [
      frenchResult,
      { ...frenchResult, id: "result-2", name: "Movie.FR.forced.srt" },
    ];
    mockDownload.mockImplementationOnce(() => new Promise(() => {}));
    await openSheet(true);
    await fireEvent.press(screen.getByText("player.download"));
    await act(async () => {
      jest.advanceTimersByTime(TVSheetTiming.tabContentDelayMs);
    });
    expect(screen.getByTestId("subtitle-result-result-2")).not.toHaveStyle({
      opacity: 0.4,
    });

    await act(async () => {
      await fireEvent.press(screen.getByText("Movie.FR.srt"));
    });
    expect(screen.getByTestId("subtitle-result-result-2")).toHaveStyle({
      opacity: 0.4,
    });
  });

  // The back and menu press closes through the same guard as a track.
  test("closes once when back follows a track", async () => {
    await openSheet(false);

    await fireEvent.press(screen.getByText("French - SRT"));
    await act(async () => {
      mockBackPress();
    });
    expect(mockCalls).toEqual(["select French", "back"]);
  });

  test("closes once when back fires twice", async () => {
    await openSheet(false);

    await act(async () => {
      mockBackPress();
      mockBackPress();
    });
    expect(mockCalls).toEqual(["back"]);
  });

  // The guard is spent before the track is applied: a track that throws must
  // still close the sheet, or it stays open and ignores every press.
  test("still closes when the track throws", async () => {
    await openSheet(false, () => {
      throw new Error("track failed");
    });

    await expect(
      fireEvent.press(screen.getByText("French - SRT")),
    ).rejects.toThrow("track failed");
    expect(mockCalls).toEqual(["back"]);
  });
});
