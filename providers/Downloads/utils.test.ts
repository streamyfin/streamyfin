import type {
  BaseItemDto,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  generateFilename,
  liveActivityPosterFileName,
  rebaseOntoDocuments,
  subtitleFileName,
  trickplayDirName,
} from "./utils";

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

  test("keeps the Live Activity poster name", () => {
    expect(liveActivityPosterFileName(episode)).toBe("item-1.jpg");
    expect(
      liveActivityPosterFileName({
        Id: "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
      }),
    ).toBe("0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9.jpg");
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
    // The reverse of the cases above: a number or an object where the types say string.
    [
      "a series name that is a number",
      { ...episode, SeriesName: 123 as unknown as string },
      subtitle,
    ],
    [
      "a movie name that is an object",
      { Type: "Movie", Name: { path: "../x" } as unknown as string },
      subtitle,
    ],
  ])("are plain file names, given %s", (_label, item, stream) => {
    const names = [
      `${generateFilename(item)}.mp4`,
      subtitleFileName(item, stream),
      trickplayDirName(item),
      liveActivityPosterFileName(item),
    ];

    // Safe characters only, and no dot but the one the app puts before the extension: nothing
    // in a name can be a separator or form a "." or ".." segment.
    for (const name of names) {
      expect(name).toMatch(/^[\w-]+(\.[\w-]+)?$/);
    }
  });
});

// iOS can move the app's container to a new UUID on an update, and the stored locations of
// downloads still named the old one, so nothing downloaded before an update would play (#2252).
describe("a stored location after the app's container moved", () => {
  const before =
    "file:///var/mobile/Containers/Data/Application/0A1B2C3D-0000-4000-8000-000000000001/Documents";
  const now =
    "file:///var/mobile/Containers/Data/Application/9F8E7D6C-0000-4000-8000-000000000002/Documents/";

  test.each([
    ["a video URI", `${before}/show_s01e01.mp4`, `${now}show_s01e01.mp4`],
    [
      "a video stored as a plain path",
      `${before.replace("file://", "")}/show_s01e01.mp4`,
      `${now.replace("file://", "")}show_s01e01.mp4`,
    ],
    [
      "a trickplay directory",
      `${before}/show_s01e01_trickplay/`,
      `${now}show_s01e01_trickplay/`,
    ],
    [
      "a URI that names the container through /private",
      `file:///private${before.replace("file://", "")}/show_s01e01.mp4`,
      `${now}show_s01e01.mp4`,
    ],
    [
      "a path that names the container through /private",
      `/private${before.replace("file://", "")}/show_s01e01.mp4`,
      `${now.replace("file://", "")}show_s01e01.mp4`,
    ],
    [
      "a file in a folder that is also called Documents",
      `${before}/Documents/show_s01e01.mp4`,
      `${now}Documents/show_s01e01.mp4`,
    ],
  ])("follows the container for %s", (_label, stored, expected) => {
    expect(rebaseOntoDocuments(stored, now)).toBe(expected);
  });

  test.each([
    ["one already in the current container", `${now}show_s01e01.mp4`],
    [
      "a server URL",
      "https://jellyfin.example/Videos/1/Subtitles/2/Stream.srt",
    ],
    ["a file outside Documents", "file:///var/mobile/Library/Caches/x.jpg"],
    // Only the app container's Documents is the old one, not any folder of that name.
    ["a Documents folder outside the app", "file:///Users/x/Documents/x.mp4"],
    [
      "a Documents folder elsewhere in the container",
      "file:///var/mobile/Containers/Shared/AppGroup/Documents/x.mp4",
    ],
    // The same layout as a container, but not under the app's containers.
    [
      "a lookalike container outside the app",
      "file:///Users/x/Application/old/Documents/clip.mp4",
    ],
    ["an empty string", ""],
  ])("leaves %s alone", (_label, stored) => {
    expect(rebaseOntoDocuments(stored, now)).toBe(stored);
  });

  // Android's files directory does not move, so its locations are already current.
  it("leaves an Android location alone", () => {
    const files = "file:///data/user/0/com.fredrikburmester.streamyfin/files/";
    expect(rebaseOntoDocuments(`${files}movie_1999.mp4`, files)).toBe(
      `${files}movie_1999.mp4`,
    );
  });
});
