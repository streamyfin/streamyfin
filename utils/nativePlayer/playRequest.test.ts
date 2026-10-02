import { getExplicitTrackIndexes, toDirectPlayerQuery } from "./playRequest";

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
