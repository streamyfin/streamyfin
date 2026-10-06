import type { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";
import { canPlayInRemoteSession, isPlayableItem } from "./isPlayableItem";

describe("isPlayableItem", () => {
  test.each<BaseItemKind>([
    "Movie",
    "Episode",
    "Video",
    "MusicVideo",
    "Trailer",
    "Recording",
    "Audio",
    "AudioBook",
  ])("a %s can be played", (type) => {
    expect(isPlayableItem({ Type: type })).toBe(true);
  });

  // Live TV is negotiated through the channel and has its own failure modes;
  // this predicate must never be the reason a channel stops playing.
  test.each<BaseItemKind>([
    "Program",
    "TvChannel",
    "LiveTvChannel",
    "LiveTvProgram",
  ])("live TV (%s) stays playable", (type) => {
    expect(isPlayableItem({ Type: type })).toBe(true);
  });

  // The three kinds production actually sent to the player: a Book from a
  // home row (REACT-NATIVE-54/5H, Android), a Season on Apple TV (same
  // issues) and a plugin Channel opened from the libraries tab
  // (REACT-NATIVE-6V).
  test.each<BaseItemKind>(["Book", "Season", "Channel"])(
    "a %s cannot be played",
    (type) => {
      expect(isPlayableItem({ Type: type })).toBe(false);
    },
  );

  test.each<BaseItemKind>([
    "Series",
    "BoxSet",
    "Folder",
    "CollectionFolder",
    "UserView",
    "Photo",
    "PhotoAlbum",
    "Playlist",
    "MusicAlbum",
    "MusicArtist",
    "Person",
  ])(
    "a %s is a container or a non video item, not something to play",
    (type) => {
      expect(isPlayableItem({ Type: type })).toBe(false);
    },
  );

  test("the server's media type decides when the kind alone would pass", () => {
    expect(isPlayableItem({ Type: "Video", MediaType: "Photo" })).toBe(false);
    expect(isPlayableItem({ MediaType: "Book" })).toBe(false);
    expect(isPlayableItem({ Type: "Movie", MediaType: "Video" })).toBe(true);
  });

  // Fail open: an item without a kind (a hand-built DTO, a kind added by a
  // newer server) is left for the server to accept or refuse.
  test("an item of unknown kind is left to the server", () => {
    expect(isPlayableItem({})).toBe(true);
    expect(isPlayableItem({ MediaType: "Unknown" })).toBe(true);
    expect(isPlayableItem({ Type: "SomethingNew" as BaseItemKind })).toBe(true);
  });
});

// A remote Play command goes through the server, which swaps a container for
// the playable items inside it before the target session sees anything. So
// "this player cannot play it" is the wrong question for the remote button.
describe("canPlayInRemoteSession", () => {
  test.each<BaseItemKind>(["Movie", "Episode"])(
    "a %s can be sent to another session",
    (type) => {
      expect(canPlayInRemoteSession({ Type: type })).toBe(true);
    },
  );

  // Regression from the first cut of this guard, which reused isPlayableItem
  // and hid the button for every container.
  test.each<BaseItemKind>([
    "Series",
    "Season",
    "BoxSet",
    "Playlist",
    "MusicAlbum",
    "Folder",
    "Channel",
  ])("a %s can be sent: the server expands it into its items", (type) => {
    expect(canPlayInRemoteSession({ Type: type })).toBe(true);
  });

  // By-name items are not folders, the server expands them all the same.
  test.each<BaseItemKind>([
    "Genre",
    "MusicGenre",
    "Studio",
    "Person",
    "Year",
    "MusicArtist",
  ])("a %s can be sent: the server expands it into what it tags", (type) => {
    expect(canPlayInRemoteSession({ Type: type })).toBe(true);
  });

  // Leaves go out as they are, and no session has a stream for these.
  test.each<BaseItemKind>(["Book", "Photo"])("a %s cannot be sent", (type) => {
    expect(canPlayInRemoteSession({ Type: type })).toBe(false);
  });

  test("the server's media type still rules out a book or a photo", () => {
    expect(canPlayInRemoteSession({ MediaType: "Book" })).toBe(false);
    expect(canPlayInRemoteSession({ Type: "Video", MediaType: "Photo" })).toBe(
      false,
    );
  });

  // Same fail-open rule as isPlayableItem: without a kind nothing says the
  // item is unplayable, so the button stays and the server decides.
  test("an item of unknown kind can be sent", () => {
    expect(canPlayInRemoteSession({})).toBe(true);
    expect(
      canPlayInRemoteSession({ Type: "SomethingNew" as BaseItemKind }),
    ).toBe(true);
  });
});
