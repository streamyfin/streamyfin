import { CACHE, fakeFiles } from "@/test-utils/fileSystem";
import {
  addDownloadedSubtitle,
  removeAllSubtitlesForItem,
} from "@/utils/atoms/downloadedSubtitles";
import { savedSubtitleFiles, savedSubtitleFor } from "./savedSubtitles";
import { localSubtitleIndex, SUBTITLES_OFF } from "./subtitleIndex";

const FRENCH = `${CACHE}/streamyfin-subtitles/item-1_fr.srt`;
const GONE = `${CACHE}/streamyfin-subtitles/item-1_de.srt`;
const ENGLISH = `${CACHE}/streamyfin-subtitles/item-1_en.srt`;

const save = (name: string, filePath: string, downloadedAt: number) =>
  addDownloadedSubtitle({
    id: name,
    itemId: "item-1",
    filePath,
    name,
    language: name,
    format: "srt",
    source: "opensubtitles",
    downloadedAt,
  });

beforeEach(() => {
  fakeFiles.clear();
  removeAllSubtitlesForItem("item-1");
  save("French", FRENCH, 1);
  save("German", GONE, 2);
  save("English", ENGLISH, 3);
  fakeFiles.add(FRENCH, ENGLISH);
});

// An app update on iOS and tvOS moves the app's data to a new container: the
// path saved before it points nowhere, the file sits under the new one.
test("finds a file saved before the app's data moved", () => {
  removeAllSubtitlesForItem("item-1");
  save(
    "Tears of Steel",
    "file:///old-container/Library/Caches/streamyfin-subtitles/item-1_Tears%20of%20Steel.srt",
    1,
  );
  const moved = `${CACHE}/streamyfin-subtitles/item-1_Tears of Steel.srt`;
  fakeFiles.add(moved);

  expect(savedSubtitleFiles("item-1")).toEqual([
    { name: "Tears of Steel", filePath: moved },
  ]);
});

// The item page lists these as the sidecar rows; a pick comes back as the row's index.
test("lists the files still on disk, in the order the item page shows them", () => {
  expect(savedSubtitleFiles("item-1")).toEqual([
    { name: "French", filePath: FRENCH },
    { name: "English", filePath: ENGLISH },
  ]);
});

test("gives the file a sidecar row's index points at", () => {
  expect(savedSubtitleFor("item-1", localSubtitleIndex(1))).toEqual({
    name: "English",
    filePath: ENGLISH,
  });
});

test("gives nothing for a server track, Off, or a row past the list", () => {
  expect(savedSubtitleFor("item-1", 3)).toBeNull();
  expect(savedSubtitleFor("item-1", SUBTITLES_OFF)).toBeNull();
  expect(savedSubtitleFor("item-1", undefined)).toBeNull();
  expect(savedSubtitleFor("item-1", localSubtitleIndex(2))).toBeNull();
});
