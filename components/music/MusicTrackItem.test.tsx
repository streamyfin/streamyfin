import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { render, screen } from "@testing-library/react-native";
import { Provider } from "jotai";
import { MusicTrackItem } from "@/components/music/MusicTrackItem";

jest.mock(
  "react-native-reanimated",
  () => jest.requireActual("@/test-utils/reanimated").reanimatedModule,
);

jest.mock("@/providers/JellyfinProvider", () =>
  jest
    .requireActual("@/test-utils/jellyfinProvider")
    .makeJellyfinAtomsModule(
      jest.requireActual("@/test-utils/jellyfinApi").makeApi(),
    ),
);
jest.mock("@/providers/MusicPlayerProvider", () => ({
  useMusicPlayer: () => ({
    playTrack: () => {},
    currentTrack: null,
    isPlaying: false,
    loadingTrackId: null,
  }),
}));
jest.mock(
  "@/hooks/useNetworkStatus",
  () => jest.requireActual("@/test-utils/appProviders").networkStatusModule,
);
jest.mock("@/providers/AudioStorage", () => ({
  getLocalPath: () => null,
  isCached: () => false,
  isPermanentDownloading: () => false,
  isPermanentlyDownloaded: () => false,
  audioStorageEvents: { on: () => {}, off: () => {} },
}));

const renderTrack = (track: BaseItemDto) =>
  render(
    <Provider>
      <MusicTrackItem track={track} />
    </Provider>,
  );

const imageUris = () =>
  screen
    .queryAllByTestId(/^image /)
    .map((node) => node.props.testID.replace("image ", ""));

test("shows the album's image when the track carries its tag", async () => {
  await renderTrack({
    Id: "track-1",
    Name: "Song",
    AlbumId: "album-1",
    AlbumPrimaryImageTag: "tag-a",
  });

  const [uri] = imageUris();
  expect(uri).toContain("/Items/album-1/Images/Primary");
  expect(uri).toContain("tag=tag-a");
});

// A placeholder beats a 404: the old URL was built without any tag.
test("shows the placeholder when the track has no image at all", async () => {
  await renderTrack({ Id: "track-2", Name: "Song", AlbumId: "album-1" });

  expect(imageUris()).toEqual([]);
});
