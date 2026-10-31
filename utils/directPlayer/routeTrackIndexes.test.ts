import { resolveRouteTrackIndexes } from "./routeTrackIndexes";

const downloaded = { audioStreamIndex: 1, subtitleStreamIndex: 2 };

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
