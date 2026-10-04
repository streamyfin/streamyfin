import type {
  BaseItemDto,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client/models";
import { generateFilename, subtitleFileName, trickplayDirName } from "./utils";

const episode: BaseItemDto = {
  Id: "item-1",
  Type: "Episode",
  SeriesName: "The Show!",
  ParentIndexNumber: 1,
  IndexNumber: 2,
};
const subtitle: MediaStream = { Type: "Subtitle", Index: 2, Codec: "subrip" };

// Downloads already on disk are found again by these names, so the values a real server sends
// have to come out exactly as they always did.
describe("names of downloads that already exist", () => {
  test.each<[string, BaseItemDto, string]>([
    ["an episode", episode, "the_show__s01e02"],
    [
      "a movie",
      { Type: "Movie", Name: "Some Movie", ProductionYear: 1999 },
      "some_movie_1999",
    ],
    [
      "a movie with no year",
      { Type: "Movie", Name: "Some Movie" },
      "some_movie_",
    ],
    [
      "another item type, named after its id",
      { Type: "Video", Id: "0a1B2c3d4e5f60718293a4b5c6d7e8f9" },
      "0a1B2c3d4e5f60718293a4b5c6d7e8f9",
    ],
    [
      "an id in the dashed GUID form",
      { Type: "Video", Id: "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9" },
      "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
    ],
  ])("keeps the name of %s", (_label, item, name) => {
    expect(generateFilename(item)).toBe(name);
  });

  test("keeps the subtitle and trickplay names", () => {
    expect(subtitleFileName(episode, subtitle)).toBe(
      "the_show__s01e02_subtitle_2.subrip",
    );
    expect(subtitleFileName(episode, { ...subtitle, Codec: "mov_text" })).toBe(
      "the_show__s01e02_subtitle_2.mov_text",
    );
    expect(subtitleFileName(episode, { ...subtitle, Codec: null })).toBe(
      "the_show__s01e02_subtitle_2.srt",
    );
    expect(trickplayDirName(episode)).toBe("the_show__s01e02_trickplay");
  });
});

// Everything below comes out of the server's JSON. The SDK types call some of these fields
// numbers, but nothing checks that at runtime, so a string can arrive in any of them.
describe("names built from values the server chooses", () => {
  const asNumber = (value: string) => value as unknown as number;

  test.each<[string, BaseItemDto, MediaStream]>([
    [
      "an item id with a parent-directory prefix",
      { Type: "Video", Id: "../../Library/x" },
      subtitle,
    ],
    [
      "an item id with a nested path",
      { Type: "Video", Id: "sub/dir" },
      subtitle,
    ],
    [
      "an item id with a backslash",
      { Type: "Video", Id: "sub\\dir" },
      subtitle,
    ],
    [
      "an item id that is a parent directory",
      { Type: "Video", Id: ".." },
      subtitle,
    ],
    [
      "a codec with a path in it",
      episode,
      { ...subtitle, Codec: "srt/../../x" },
    ],
    [
      "a codec that is a parent directory",
      episode,
      { ...subtitle, Codec: ".." },
    ],
    [
      "a stream index that is a path",
      episode,
      { ...subtitle, Index: asNumber("../x") },
    ],
    [
      "a season number that is a path",
      { ...episode, ParentIndexNumber: asNumber("../x") },
      subtitle,
    ],
    [
      "an episode number that is a path",
      { ...episode, IndexNumber: asNumber("../x") },
      subtitle,
    ],
    [
      "a production year that is a path",
      { Type: "Movie", Name: "Movie", ProductionYear: asNumber("/../x") },
      subtitle,
    ],
  ])("are plain file names, given %s", (_label, item, stream) => {
    const names = [
      `${generateFilename(item)}.mp4`,
      subtitleFileName(item, stream),
      trickplayDirName(item),
    ];

    // Safe characters only, and no dot but the one the app puts before the extension: nothing
    // in a name can be a separator or form a "." or ".." segment.
    for (const name of names) {
      expect(name).toMatch(/^[\w-]+(\.[\w-]+)?$/);
    }
  });
});
