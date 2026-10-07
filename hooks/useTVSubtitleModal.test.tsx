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
jest.mock("@/hooks/useTVBackPress", () => ({ useTVBackPress: () => {} }));
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
const mockDownload = jest.fn(async (_result: { id: string }) => ({
  type: "local",
  path: "/subtitles/movie.fr.srt",
}));
jest.mock("@/hooks/useRemoteSubtitles", () => ({
  useRemoteSubtitles: () => ({
    hasOpenSubtitlesApiKey: true,
    isSearching: false,
    searchError: null,
    searchResults: [
      {
        id: "result-1",
        name: "Movie.FR.srt",
        providerName: "OpenSubtitles",
        format: "srt",
        language: "fre",
      },
    ],
    search: () => {},
    downloadAsync: (result: { id: string }) => mockDownload(result),
    reset: () => {},
  }),
}));

const openSheet = async (deferApplyUntilDismissed: boolean) => {
  const { result } = await renderHook(() => useTVSubtitleModal());
  await act(async () => {
    result.current.showSubtitleModal({
      item: { Id: "movie-1", Name: "Movie" } as BaseItemDto,
      subtitleTracks: [
        {
          name: "French - SRT",
          index: 3,
          setTrack: () => {
            mockCalls.push("select French");
          },
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
    jest.advanceTimersByTime(50);
  });
};

describe("TV subtitle sheet", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCalls.length = 0;
    mockSelectFires = 1;
    mockDownload.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  // In the player a track can navigate (a burn-in switch while transcoding
  // replaces the player), which the sheet's route would swallow: the sheet
  // closes first and the track lands after it.
  test("closes first and applies a navigating track after", async () => {
    await openSheet(true);

    await fireEvent.press(screen.getByText("French - SRT"));
    expect(mockCalls).toEqual(["back"]);

    await act(async () => {
      jest.runAllTimers();
    });
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
    await act(async () => {
      jest.runAllTimers();
    });
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
      jest.advanceTimersByTime(50);
    });

    mockSelectFires = 2;
    await act(async () => {
      await fireEvent.press(screen.getByText("Movie.FR.srt"));
    });
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockCalls).toEqual(["added /subtitles/movie.fr.srt"]);
  });
});
