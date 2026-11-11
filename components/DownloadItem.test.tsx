import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { toast } from "sonner-native";
import { clearMmkv } from "@/test-utils/mmkv";
import type { Settings } from "@/utils/atoms/settings";
import { getDownloadStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { logAndCaptureError, writeToLog } from "@/utils/log";
import { rememberSeriesTrack } from "@/utils/seriesTrackMemory";
import { DownloadItems, DownloadSingleItem } from "./DownloadItem";
import type { OptionGroup } from "./PlatformDropdown";

const mockStartBackgroundDownload = jest.fn();
let mockDownloadedItems: { item: BaseItemDto }[] = [];
let mockSettings: Partial<Settings> | null = null;
let mockProcesses: { item: BaseItemDto; progress: number }[] = [];
let mockIconMounts: Record<string, number> = {};
// The icons on screen now, by name: a remount and a vanished icon both show.
let mockIconsShown: Record<string, number> = {};

jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    processes: mockProcesses,
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
  useSettings: () => ({ settings: mockSettings }),
}));
jest.mock("@/utils/jellyfin/media/getStreamUrl", () => ({
  getDownloadStreamUrl: jest.fn(),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeToLog: jest.fn(),
}));
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
jest.mock("@/components/common/HeaderIcon", () => ({
  HeaderIcon: ({ name }: { name: string }) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      mockIconMounts[name] = (mockIconMounts[name] ?? 0) + 1;
      mockIconsShown[name] = (mockIconsShown[name] ?? 0) + 1;
      return () => {
        mockIconsShown[name] -= 1;
      };
    }, []);
    return null;
  },
}));
// The real module needs the native worklets runtime. The double lets the ring
// render for real, with its animation landing at once.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("@/test-utils/reanimated").reanimatedModule,
  __esModule: true,
}));
// Lists the options instead of a menu to open, so a spec can see what a
// selector offers and pick from it.
jest.mock("./PlatformDropdown", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    PlatformDropdown: ({ groups }: { groups: OptionGroup[] }) =>
      groups.flatMap((group) =>
        group.options.map((option) => (
          <Text
            key={option.label}
            onPress={"onPress" in option ? option.onPress : undefined}
          >
            {option.label}
          </Text>
        )),
      ),
  };
});

const MEDIA_SOURCE = { Id: "source-1", MediaStreams: [] };

// Chapters are present so the download does not go and fetch the item again.
const MOVIE: BaseItemDto = {
  Id: "movie-1",
  Type: "Movie",
  Name: "Movie",
  Chapters: [],
  MediaSources: [MEDIA_SOURCE],
};

// The server lists media sources for what it can play only, so a folder
// comes back without the field.
const FOLDER: BaseItemDto = {
  Id: "folder-1",
  Type: "Folder",
  Name: "Holiday",
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

type HostView = NonNullable<ReturnType<typeof screen.toJSON>>;

/** The native views of a type in what is on screen, in drawing order. */
const hostViews = (type: string) => {
  const found: HostView[] = [];
  const visit = (node: HostView | string | null) => {
    if (!node || typeof node === "string") return;
    if (node.type === type) found.push(node);
    node.children?.forEach(visit);
  };
  visit(screen.toJSON());
  return found;
};

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
    await jest.runOnlyPendingTimersAsync();
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  // Clearing keeps a stubbed answer, and it must not outlive its test.
  // Resetting every mock instead would also wipe the ones jest-expo sets up.
  jest.mocked(getDownloadStreamUrl).mockReset();
  mockDownloadedItems = [];
  mockSettings = null;
  mockProcesses = [];
  mockIconMounts = {};
  mockIconsShown = {};
});

afterEach(() => {
  jest.useRealTimers();
});

describe("DownloadSingleItem", () => {
  test.each([
    ["downloads", false],
    ["downloaded", true],
  ])(
    "keeps the %s icon mounted when another episode finishes",
    async (name, isDownloaded) => {
      const item = episode(1);
      mockDownloadedItems = isDownloaded ? [{ item }] : [];
      const view = await render(<DownloadSingleItem item={item} />);
      const mountsBeforeDownload = mockIconMounts[name] ?? 0;
      expect(mockIconsShown[name]).toBe(1);

      mockDownloadedItems = [...mockDownloadedItems, { item: episode(2) }];
      await view.rerender(<DownloadSingleItem item={item} />);

      expect(mockIconsShown[name]).toBe(1);
      expect(mockIconMounts[name]).toBe(mountsBeforeDownload);
    },
  );

  // Sentry REACT-NATIVE-FX: the item page shows the download button for an
  // item the server lists no media source for. Confirming the sheet threw "No
  // api or user or item" where nobody caught it, so the user saw nothing
  // happen and the app reported an error of its own.
  test("tells the user when the item has no media source to download", async () => {
    await render(<DownloadSingleItem item={FOLDER} />);

    await confirmDownload();

    expect(toast.error).toHaveBeenCalledWith(
      "home.downloads.toasts.no_media_source_to_download",
    );
    expect(getDownloadStreamUrl).not.toHaveBeenCalled();
    expect(mockStartBackgroundDownload).not.toHaveBeenCalled();
  });

  // The throw was the only trace of this state. What kind of item it was
  // stays in the local log, which is where a user's own situation belongs.
  test("keeps a turned-down download in the local log without reporting it", async () => {
    await render(<DownloadSingleItem item={FOLDER} />);

    await confirmDownload();

    expect(writeToLog).toHaveBeenCalledWith("WARN", expect.any(String), {
      itemType: "Folder",
    });
    expect(logAndCaptureError).not.toHaveBeenCalled();
  });

  test("starts the download of an item that has a media source", async () => {
    jest.mocked(getDownloadStreamUrl).mockResolvedValue({
      url: "http://server/download",
      sessionId: null,
      mediaSource: MEDIA_SOURCE,
    });
    await render(<DownloadSingleItem item={MOVIE} />);

    await confirmDownload();

    expect(toast.error).not.toHaveBeenCalled();
    expect(getDownloadStreamUrl).toHaveBeenCalledWith(
      expect.objectContaining({ mediaSourceId: "source-1" }),
    );
    expect(mockStartBackgroundDownload).toHaveBeenCalledTimes(1);
  });

  // The sheet asked for the bitrates lowest first, to be read bottom up in an
  // iOS menu that reversed them. Menus keep their order now, so Max came last.
  test("lists the bitrates from Max down", async () => {
    await render(<DownloadSingleItem item={MOVIE} />);

    const bitrates = screen
      .getAllByText(/^(Max|\d+ [MK]b\/s)$/)
      .map((option) => option.props.children);
    expect(bitrates).toEqual([
      "Max",
      "8 Mb/s",
      "4 Mb/s",
      "2 Mb/s",
      "1 Mb/s",
      "500 Kb/s",
      "250 Kb/s",
    ]);
  });

  test("draws the ring of a download in progress filled to its progress", async () => {
    mockProcesses = [{ item: MOVIE, progress: 40 }];
    await render(<DownloadSingleItem item={MOVIE} />);

    const [track, ring] = hostViews("RNSVGCircle");
    const circumference = 2 * Math.PI * Number(ring.props.r);
    expect(ring.props.strokeDashoffset).toBeCloseTo(circumference * 0.6);
    expect(track.props.strokeDashoffset).toBeUndefined();
    // Turned a quarter back, so the ring starts filling from the top.
    expect(hostViews("RNSVGSvgView")[0].props.transform).toEqual([
      { rotate: "-90deg" },
    ]);
  });
});

describe("DownloadSingleItem, picking a version", () => {
  // Stream indexes are numbered per version, so B's tracks are not A's.
  const versions: BaseItemDto = {
    ...MOVIE,
    MediaSources: [
      {
        Id: "source-a",
        Name: "Version A",
        DefaultAudioStreamIndex: 1,
        DefaultSubtitleStreamIndex: 2,
        MediaStreams: [],
      },
      {
        Id: "source-b",
        Name: "Version B",
        DefaultAudioStreamIndex: 3,
        DefaultSubtitleStreamIndex: 4,
        MediaStreams: [],
      },
    ],
  };

  beforeEach(() => {
    jest.mocked(getDownloadStreamUrl).mockResolvedValue({
      url: "http://server/download",
      sessionId: null,
      mediaSource: versions.MediaSources?.[1],
    });
  });

  // Switching the version kept the tracks of the first one, so the download
  // asked for, and the offline player then restored, indexes from version A.
  test("downloads the tracks of the version picked, not of the first one", async () => {
    await render(<DownloadSingleItem item={versions} />);

    await fireEvent.press(screen.getByText("Version B"));
    await confirmDownload();

    expect(getDownloadStreamUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaSourceId: "source-b",
        audioStreamIndex: 3,
        subtitleStreamIndex: 4,
      }),
    );
    expect(mockStartBackgroundDownload).toHaveBeenCalledWith(
      "http://server/download",
      expect.objectContaining({ Id: "movie-1" }),
      expect.anything(),
      expect.anything(),
      3,
      4,
    );
  });

  test("keeps the language picked on the first version", async () => {
    mockSettings = { rememberAudioSelections: true };
    const audio = (index: number, language: string, title: string) => ({
      Type: "Audio" as const,
      Index: index,
      Language: language,
      DisplayTitle: title,
    });
    // As the server numbers them, Index is the position in the list. B has a
    // subtitle first, so its French track is 3 where A's is 2, and A's 2 is
    // B's English.
    await render(
      <DownloadSingleItem
        item={{
          ...MOVIE,
          MediaSources: [
            {
              Id: "source-a",
              Name: "Version A",
              DefaultAudioStreamIndex: 1,
              MediaStreams: [
                { Type: "Video", Index: 0 },
                audio(1, "eng", "English A"),
                audio(2, "fre", "French A"),
              ],
            },
            {
              Id: "source-b",
              Name: "Version B",
              DefaultAudioStreamIndex: 2,
              MediaStreams: [
                { Type: "Video", Index: 0 },
                { Type: "Subtitle", Index: 1 },
                audio(2, "eng", "English B"),
                audio(3, "fre", "French B"),
              ],
            },
          ],
        }}
      />,
    );

    await fireEvent.press(screen.getByText("French A"));
    await fireEvent.press(screen.getByText("Version B"));
    await confirmDownload();

    expect(getDownloadStreamUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaSourceId: "source-b",
        audioStreamIndex: 3,
      }),
    );
  });

  // A's default "off" was carried over as if the user had turned subtitles
  // off, so B's own default subtitle was dropped.
  test("keeps the default subtitle of the version picked when none was picked", async () => {
    mockSettings = { rememberSubtitleSelections: true };
    const subtitle = (index: number) => ({
      Type: "Subtitle" as const,
      Index: index,
      Language: "eng",
      DisplayTitle: `English ${index}`,
    });
    await render(
      <DownloadSingleItem
        item={{
          ...MOVIE,
          MediaSources: [
            {
              Id: "source-a",
              Name: "Version A",
              DefaultSubtitleStreamIndex: -1,
              MediaStreams: [{ Type: "Video", Index: 0 }, subtitle(1)],
            },
            {
              Id: "source-b",
              Name: "Version B",
              DefaultSubtitleStreamIndex: 4,
              MediaStreams: [{ Type: "Video", Index: 0 }, subtitle(4)],
            },
          ],
        }}
      />,
    );

    await fireEvent.press(screen.getByText("Version B"));
    await confirmDownload();

    expect(getDownloadStreamUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaSourceId: "source-b",
        subtitleStreamIndex: 4,
      }),
    );
  });

  describe("with a subtitle picked on the first version", () => {
    const subtitle = (index: number, language: string, title: string) => ({
      Type: "Subtitle" as const,
      Index: index,
      Language: language,
      DisplayTitle: title,
    });
    // B numbers its subtitles from 3 and defaults to English.
    const subtitledVersions: BaseItemDto = {
      ...MOVIE,
      MediaSources: [
        {
          Id: "source-a",
          Name: "Version A",
          DefaultSubtitleStreamIndex: 1,
          MediaStreams: [
            { Type: "Video", Index: 0 },
            subtitle(1, "eng", "English A"),
            subtitle(2, "fre", "French A"),
          ],
        },
        {
          Id: "source-b",
          Name: "Version B",
          DefaultSubtitleStreamIndex: 3,
          MediaStreams: [
            { Type: "Video", Index: 0 },
            subtitle(3, "eng", "English B"),
            subtitle(4, "fre", "French B"),
          ],
        },
      ],
    };

    beforeEach(() => {
      mockSettings = { rememberSubtitleSelections: true };
    });

    test("keeps that subtitle's language", async () => {
      await render(<DownloadSingleItem item={subtitledVersions} />);

      await fireEvent.press(screen.getByText("French A"));
      await fireEvent.press(screen.getByText("Version B"));
      await confirmDownload();

      expect(getDownloadStreamUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaSourceId: "source-b",
          subtitleStreamIndex: 4,
        }),
      );
    });

    test("keeps subtitles off when they were turned off", async () => {
      await render(<DownloadSingleItem item={subtitledVersions} />);

      await fireEvent.press(screen.getByText("item_card.none"));
      await fireEvent.press(screen.getByText("Version B"));
      await confirmDownload();

      expect(getDownloadStreamUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaSourceId: "source-b",
          subtitleStreamIndex: -1,
        }),
      );
    });

    // The remember settings carry a track to the next item. Another version
    // of the same one is not that, so the pick follows it either way.
    test("keeps the pick when remembering subtitles is off", async () => {
      mockSettings = {};
      await render(<DownloadSingleItem item={subtitledVersions} />);

      await fireEvent.press(screen.getByText("item_card.none"));
      await fireEvent.press(screen.getByText("Version B"));
      await confirmDownload();

      expect(getDownloadStreamUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaSourceId: "source-b",
          subtitleStreamIndex: -1,
        }),
      );
    });

    // The version menu calls back for the row already selected too.
    test("keeps the pick when the same version is picked again", async () => {
      mockSettings = {};
      await render(<DownloadSingleItem item={subtitledVersions} />);

      await fireEvent.press(screen.getByText("French A"));
      await fireEvent.press(screen.getByText("Version A"));
      await confirmDownload();

      expect(getDownloadStreamUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaSourceId: "source-a",
          subtitleStreamIndex: 2,
        }),
      );
    });

    // B has no French and falls back to its own default; that default is not
    // the user's pick, which is still French back on A.
    test("keeps the pick through a version that does not have it", async () => {
      await render(
        <DownloadSingleItem
          item={{
            ...subtitledVersions,
            MediaSources: [
              subtitledVersions.MediaSources?.[0] ?? {},
              {
                Id: "source-b",
                Name: "Version B",
                DefaultSubtitleStreamIndex: -1,
                MediaStreams: [
                  { Type: "Video", Index: 0 },
                  subtitle(3, "eng", "English B"),
                ],
              },
            ],
          }}
        />,
      );

      await fireEvent.press(screen.getByText("French A"));
      await fireEvent.press(screen.getByText("Version B"));
      await fireEvent.press(screen.getByText("Version A"));
      await confirmDownload();

      expect(getDownloadStreamUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaSourceId: "source-a",
          subtitleStreamIndex: 2,
        }),
      );
    });
  });

  describe("with an audio track picked on the first version", () => {
    const audio = (
      index: number,
      language: string,
      title: string,
      codec = "aac",
    ) => ({
      Type: "Audio" as const,
      Index: index,
      Language: language,
      DisplayTitle: title,
      Codec: codec,
    });
    const versionA = {
      Id: "source-a",
      Name: "Version A",
      DefaultAudioStreamIndex: 1,
      MediaStreams: [
        { Type: "Video" as const, Index: 0 },
        audio(1, "eng", "English A"),
        audio(2, "fre", "French A"),
      ],
    };
    const withVersionB = (
      streams: ReturnType<typeof audio>[],
      defaultIndex: number,
    ): BaseItemDto => ({
      ...MOVIE,
      MediaSources: [
        versionA,
        {
          Id: "source-b",
          Name: "Version B",
          DefaultAudioStreamIndex: defaultIndex,
          MediaStreams: [{ Type: "Video", Index: 0 }, ...streams],
        },
      ],
    });

    test("keeps the pick when remembering audio is off", async () => {
      mockSettings = {};
      await render(
        <DownloadSingleItem
          item={withVersionB(
            [audio(1, "eng", "English B"), audio(2, "fre", "French B")],
            1,
          )}
        />,
      );

      await fireEvent.press(screen.getByText("French A"));
      await fireEvent.press(screen.getByText("Version B"));
      await confirmDownload();

      expect(getDownloadStreamUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaSourceId: "source-b",
          audioStreamIndex: 2,
        }),
      );
    });

    test("keeps the pick through a version that does not have it", async () => {
      mockSettings = { rememberAudioSelections: true };
      await render(
        <DownloadSingleItem
          item={withVersionB(
            [audio(1, "eng", "English B"), audio(2, "ger", "German B")],
            1,
          )}
        />,
      );

      await fireEvent.press(screen.getByText("French A"));
      await fireEvent.press(screen.getByText("Version B"));
      await fireEvent.press(screen.getByText("Version A"));
      await confirmDownload();

      expect(getDownloadStreamUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaSourceId: "source-a",
          audioStreamIndex: 2,
        }),
      );
    });

    // A remux of the same film: other codec, other title, French first.
    test("keeps the pick's language on a version encoded differently", async () => {
      mockSettings = { rememberAudioSelections: true };
      await render(
        <DownloadSingleItem
          item={withVersionB(
            [
              audio(1, "fre", "French B", "truehd"),
              audio(2, "eng", "English B", "truehd"),
            ],
            2,
          )}
        />,
      );

      await fireEvent.press(screen.getByText("French A"));
      await fireEvent.press(screen.getByText("Version B"));
      await confirmDownload();

      expect(getDownloadStreamUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaSourceId: "source-b",
          audioStreamIndex: 1,
        }),
      );
    });
  });
});

describe("DownloadSingleItem, picks made on two versions", () => {
  const track = (
    type: "Audio" | "Subtitle",
    index: number,
    language: string,
    title: string,
  ) => ({
    Type: type,
    Index: index,
    Language: language,
    DisplayTitle: title,
    Codec: type === "Audio" ? "aac" : "subrip",
  });
  // B has a third audio track, so its subtitles are numbered one higher.
  const twoVersions: BaseItemDto = {
    ...MOVIE,
    MediaSources: [
      {
        Id: "source-a",
        Name: "Version A",
        DefaultAudioStreamIndex: 1,
        DefaultSubtitleStreamIndex: -1,
        MediaStreams: [
          { Type: "Video", Index: 0 },
          track("Audio", 1, "eng", "English audio A"),
          track("Audio", 2, "fre", "French audio A"),
          track("Subtitle", 3, "eng", "English subtitles A"),
          track("Subtitle", 4, "fre", "French subtitles A"),
        ],
      },
      {
        Id: "source-b",
        Name: "Version B",
        DefaultAudioStreamIndex: 1,
        DefaultSubtitleStreamIndex: -1,
        MediaStreams: [
          { Type: "Video", Index: 0 },
          track("Audio", 1, "eng", "English audio B"),
          track("Audio", 2, "fre", "French audio B"),
          track("Audio", 3, "ger", "German audio B"),
          track("Subtitle", 4, "eng", "English subtitles B"),
          track("Subtitle", 5, "fre", "French subtitles B"),
        ],
      },
    ],
  };

  beforeEach(() => {
    mockSettings = {};
    jest.mocked(getDownloadStreamUrl).mockResolvedValue({
      url: "http://server/download",
      sessionId: null,
      mediaSource: twoVersions.MediaSources?.[0],
    });
  });

  // With remembering off, a series' remembered subtitle stays out of it: no
  // track was picked, so the version keeps its own default.
  test("leaves the series memory out when remembering is off", async () => {
    clearMmkv();
    rememberSeriesTrack("series-1", { subtitleLang: "fre" });
    const episode: BaseItemDto = {
      ...twoVersions,
      Type: "Episode",
      SeriesId: "series-1",
    };
    await render(<DownloadSingleItem item={episode} />);

    await fireEvent.press(screen.getByText("Version B"));
    await confirmDownload();

    expect(getDownloadStreamUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaSourceId: "source-b",
        subtitleStreamIndex: -1,
      }),
    );
    clearMmkv();
  });

  // Smart turns subtitles on for audio in another language than the one the
  // subtitles are wanted in. French audio picked on A, German subtitles picked
  // on B: C has no German, and Smart must read the French it carried.
  test("applies the subtitle mode to the audio picked on another version", async () => {
    mockSettings = {
      subtitleMode: "Smart" as never,
      defaultSubtitleLanguage: { ThreeLetterISOLanguageName: "eng" } as never,
    };
    const third: BaseItemDto = {
      ...twoVersions,
      MediaSources: [
        ...(twoVersions.MediaSources ?? []),
        {
          Id: "source-c",
          Name: "Version C",
          DefaultAudioStreamIndex: 1,
          DefaultSubtitleStreamIndex: -1,
          MediaStreams: [
            { Type: "Video", Index: 0 },
            track("Audio", 1, "eng", "English audio C"),
            track("Audio", 2, "fre", "French audio C"),
            track("Subtitle", 3, "eng", "English subtitles C"),
          ],
        },
      ],
    };
    third.MediaSources?.[1]?.MediaStreams?.push(
      track("Subtitle", 6, "ger", "German subtitles B"),
    );
    await render(<DownloadSingleItem item={third} />);

    await fireEvent.press(screen.getByText("French audio A"));
    await fireEvent.press(screen.getByText("Version B"));
    await fireEvent.press(screen.getByText("German subtitles B"));
    await fireEvent.press(screen.getByText("Version C"));
    await confirmDownload();

    expect(getDownloadStreamUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaSourceId: "source-c",
        audioStreamIndex: 2,
        subtitleStreamIndex: 3,
      }),
    );
  });

  // Each pick is matched from the version it was made on: B's subtitle 5 read
  // on A, where no stream has that Index, would lose it.
  test("matches each pick from its own version", async () => {
    await render(<DownloadSingleItem item={twoVersions} />);

    await fireEvent.press(screen.getByText("French audio A"));
    await fireEvent.press(screen.getByText("Version B"));
    await fireEvent.press(screen.getByText("French subtitles B"));
    await fireEvent.press(screen.getByText("Version A"));
    await confirmDownload();

    expect(getDownloadStreamUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaSourceId: "source-a",
        audioStreamIndex: 2,
        subtitleStreamIndex: 4,
      }),
    );
  });
});

describe("DownloadItems, sending one episode of a season", () => {
  beforeEach(() => {
    jest.mocked(getDownloadStreamUrl).mockResolvedValue({
      url: "http://server/download",
      sessionId: null,
      mediaSource: { Id: "source", MediaStreams: [] },
    });
  });

  // The sheet took its source and tracks from the first episode of the list
  // while the one left to download was another, so the server was asked for
  // that episode with a media source id that belongs to a different one.
  test("downloads the last one pending with its own media source and default tracks", async () => {
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
  test("does not turn the last one pending down because the first episode has no media source", async () => {
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

  // The sheet lists the versions to pick from as well, and picking one of the
  // first episode's sent a source the pending episode does not have.
  test("offers the versions of the last one pending and downloads the one picked", async () => {
    const pending: BaseItemDto = {
      ...episode(2),
      MediaSources: [
        ...(episode(2).MediaSources ?? []),
        { Id: "source-2b", Name: "Episode 2, version B", MediaStreams: [] },
      ],
    };
    const downloaded: BaseItemDto = {
      ...episode(1),
      MediaSources: [
        { Id: "source-1", Name: "Episode 1, version A", MediaStreams: [] },
      ],
    };
    mockDownloadedItems = [{ item: downloaded }];
    await renderSeasonDownload([downloaded, pending]);

    expect(screen.queryByText("Episode 1, version A")).toBeNull();
    await fireEvent.press(screen.getByText("Episode 2, version B"));
    await confirmDownload();

    expect(getDownloadStreamUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ Id: "episode-2" }),
        mediaSourceId: "source-2b",
      }),
    );
  });

  // Not a regression of the above, and green before it was fixed: "unwatched
  // only" narrows what is sent, not what is pending. The sheet offers no
  // source or tracks then, and each episode resolves its own. Pinned so a
  // later change to which item the sheet follows does not pull this case in.
  test("downloads the one left by the unwatched only switch with its own media source", async () => {
    const watched = { ...episode(1), UserData: { Key: "", Played: true } };
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
