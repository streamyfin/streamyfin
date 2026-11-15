import { resolveRouteTrackIndexes } from "./routeTrackIndexes";

const downloaded = {
  audioStreamIndex: 1,
  subtitleStreamIndex: 2,
  isTranscoded: false,
};

// PlayButton opens a download with both params blank.
test("falls back to the download record offline", () => {
  expect(
    resolveRouteTrackIndexes({
      audioIndex: "",
      subtitleIndex: "",
      offline: true,
      downloaded,
    }),
  ).toEqual({ audioIndex: 1, subtitleIndex: 2 });
});

test("prefers what the route asks for over the download record", () => {
  expect(
    resolveRouteTrackIndexes({
      audioIndex: "3",
      subtitleIndex: "-1",
      offline: true,
      downloaded,
    }),
  ).toEqual({ audioIndex: 3, subtitleIndex: -1 });
});

test("ignores a download record while streaming", () => {
  expect(
    resolveRouteTrackIndexes({
      audioIndex: "",
      subtitleIndex: "",
      offline: false,
      downloaded,
    }),
  ).toEqual({ audioIndex: undefined, subtitleIndex: -1 });
});

test("reads subtitles as off when neither the route nor a record has one", () => {
  expect(
    resolveRouteTrackIndexes({
      audioIndex: undefined,
      subtitleIndex: undefined,
      offline: true,
      downloaded: null,
    }),
  ).toEqual({ audioIndex: undefined, subtitleIndex: -1 });
});

// Records written by 0.51 and older hold 0 for both tracks as a placeholder,
// and no isTranscoded: index 0 is then a sidecar the user never picked.
test("ignores the placeholders of a record from before tracks were recorded", () => {
  expect(
    resolveRouteTrackIndexes({
      audioIndex: "",
      subtitleIndex: "",
      offline: true,
      downloaded: { audioStreamIndex: 0, subtitleStreamIndex: 0 },
    }),
  ).toEqual({ audioIndex: undefined, subtitleIndex: -1 });
});
