import type {
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import { StreamRanker, SubtitleStreamRanker } from "./streamRanker";

/** Exercise the existing carry-over API with real Jellyfin stream indexes. */
function rank(previous: MediaStream, streams: MediaStream[]) {
  const previousSource: MediaSourceInfo = { MediaStreams: [previous] };
  const result = { DefaultSubtitleStreamIndex: -1, matched: false };
  new StreamRanker(new SubtitleStreamRanker()).rankStream(
    previous.Index ?? -1,
    previousSource,
    streams,
    result,
  );
  return result;
}

test("resolves a previously selected subtitle by Index, not array position", () => {
  expect(
    rank({ Index: 8, Type: "Subtitle", Language: "eng", IsForced: true }, [
      { Index: 2, Type: "Subtitle", Language: "eng" },
      { Index: 12, Type: "Subtitle", Language: "eng", IsForced: true },
    ]),
  ).toEqual({ DefaultSubtitleStreamIndex: 12, matched: true });
});

test("ignores subtitle candidates that have no selectable index", () => {
  expect(
    rank({ Index: 0, Type: "Subtitle", Language: "eng", Title: "Full" }, [
      { Type: "Subtitle", Language: "eng", Title: "Full" },
      { Index: 4, Type: "Subtitle", Language: "eng", Title: "Full" },
    ]),
  ).toEqual({ DefaultSubtitleStreamIndex: 4, matched: true });
});

test("prefers the equivalent subtitle mode over a coincidentally matching title", () => {
  expect(
    rank(
      {
        Index: 0,
        Type: "Subtitle",
        Language: "eng",
        IsForced: true,
        Title: "English",
        DisplayTitle: "English - ASS",
        Codec: "ass",
      },
      [
        {
          Index: 2,
          Type: "Subtitle",
          Language: "eng",
          Title: "English",
          DisplayTitle: "English - ASS",
          Codec: "ass",
        },
        {
          Index: 7,
          Type: "Subtitle",
          Language: "eng",
          IsForced: true,
          Codec: "srt",
        },
      ],
    ),
  ).toEqual({ DefaultSubtitleStreamIndex: 7, matched: true });
});
