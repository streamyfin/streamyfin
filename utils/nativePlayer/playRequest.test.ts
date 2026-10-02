import { localSubtitleIndex } from "@/utils/subtitles/subtitleIndex";
import {
  getExplicitTrackIndexes,
  getStreamRequestIndexes,
  toDirectPlayerQuery,
} from "./playRequest";

test("does not send stale menu defaults as explicit picks", () => {
  expect(getExplicitTrackIndexes({ audioIndex: 4, subtitleIndex: 7 })).toEqual({
    audioIndex: undefined,
    subtitleIndex: undefined,
  });
});

test("preserves explicit zero and subtitles off", () => {
  const selection = getExplicitTrackIndexes({
    audioIndex: 0,
    subtitleIndex: -1,
    audioSelectionExplicit: true,
    subtitleSelectionExplicit: true,
  });
  expect(selection).toEqual({ audioIndex: 0, subtitleIndex: -1 });
});

test("audio and subtitle explicitness are independent", () => {
  expect(
    getExplicitTrackIndexes({
      audioIndex: 4,
      subtitleIndex: 7,
      audioSelectionExplicit: true,
    }),
  ).toEqual({ audioIndex: 4, subtitleIndex: undefined });
});

test("missing indexes stay missing in the direct-player route", () => {
  const query = new URLSearchParams(
    toDirectPlayerQuery({
      itemId: "item-1",
      offline: false,
      ...getExplicitTrackIndexes({
        audioIndex: 4,
        subtitleIndex: 7,
      }),
    }),
  );
  expect(query.get("audioIndex")).toBe("");
  expect(query.get("subtitleIndex")).toBe("");
});

test("subtitle refresh keeps live audio and subtitle picks rather than stale route indexes", () => {
  expect(
    getStreamRequestIndexes(
      { audioIndex: 1, subtitleIndex: 4 },
      { audioIndex: 8, subtitleIndex: 11 },
    ),
  ).toEqual({ audioIndex: 8, subtitleIndex: 11 });
});

test("live zero and subtitle off survive a refresh", () => {
  expect(
    getStreamRequestIndexes(
      { audioIndex: 1, subtitleIndex: 4 },
      { audioIndex: 0, subtitleIndex: -1 },
    ),
  ).toEqual({ audioIndex: 0, subtitleIndex: -1 });
});

test("a live snapshot never falls back to stale route values for missing fields", () => {
  expect(
    getStreamRequestIndexes({ audioIndex: 1, subtitleIndex: 4 }, {}),
  ).toEqual({ audioIndex: undefined, subtitleIndex: undefined });
});

test("initial automatic selections stay unset until server negotiation", () => {
  expect(getStreamRequestIndexes({})).toEqual({
    audioIndex: undefined,
    subtitleIndex: undefined,
  });
});

test("client-only subtitles are never sent to the server as stream indexes", () => {
  expect(
    getStreamRequestIndexes(
      { audioIndex: 1, subtitleIndex: 4 },
      { audioIndex: 8, subtitleIndex: localSubtitleIndex(0) },
    ),
  ).toEqual({ audioIndex: 8, subtitleIndex: -1 });
});
