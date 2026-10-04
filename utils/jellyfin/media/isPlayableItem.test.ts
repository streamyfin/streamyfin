import type { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";
import { isPlayableItem } from "./isPlayableItem";

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
