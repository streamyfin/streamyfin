import { describe, expect, test } from "bun:test";
import type {
  BaseItemDto,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getMediaQualityBadges } from "@/utils/jellyfin/getMediaQualityBadges";

// --- fixtures --------------------------------------------------------------

const video = (o: Partial<MediaStream> = {}): MediaStream =>
  ({ Type: "Video", Width: 1920, ...o }) as MediaStream;

const audio = (o: Partial<MediaStream> = {}): MediaStream =>
  ({ Type: "Audio", ...o }) as MediaStream;

const subtitle = (o: Partial<MediaStream> = {}): MediaStream =>
  ({ Type: "Subtitle", ...o }) as MediaStream;

const itemWithSource = (streams: MediaStream[]): BaseItemDto =>
  ({ MediaSources: [{ MediaStreams: streams }] }) as BaseItemDto;

// --- tests ---------------------------------------------------------------

describe("getMediaQualityBadges", () => {
  test("returns nothing for an SDR 1080p source", () => {
    expect(
      getMediaQualityBadges(
        itemWithSource([video({ Width: 1920, VideoRange: "SDR" }), audio()]),
      ),
    ).toEqual([]);
  });

  test("returns nothing when the item has no media source", () => {
    expect(getMediaQualityBadges({ Type: "Series" } as BaseItemDto)).toEqual(
      [],
    );
  });

  test("flags a 4K Dolby Vision source with Atmos audio, in fixed order", () => {
    const badges = getMediaQualityBadges(
      itemWithSource([
        video({ Width: 3840, VideoRangeType: "DOVIWithHDR10" }),
        audio({ Profile: "Dolby Atmos" }),
      ]),
    );
    expect(badges).toEqual(["4K", "Dolby Vision", "Atmos"]);
  });

  test("detects Dolby Vision from a Dv version field", () => {
    expect(
      getMediaQualityBadges(itemWithSource([video({ DvVersionMajor: 1 })])),
    ).toEqual(["Dolby Vision"]);
  });

  test("maps the HDR10+ / HDR10 / HLG range types", () => {
    expect(
      getMediaQualityBadges(
        itemWithSource([video({ VideoRangeType: "HDR10Plus" })]),
      ),
    ).toEqual(["HDR10+"]);
    expect(
      getMediaQualityBadges(
        itemWithSource([video({ VideoRangeType: "HDR10" })]),
      ),
    ).toEqual(["HDR10"]);
    expect(
      getMediaQualityBadges(itemWithSource([video({ VideoRangeType: "HLG" })])),
    ).toEqual(["HLG"]);
  });

  test("falls back to a plain HDR badge from VideoRange", () => {
    expect(
      getMediaQualityBadges(itemWithSource([video({ VideoRange: "HDR" })])),
    ).toEqual(["HDR"]);
  });

  test("adds CC when subtitles exist and SDH for hearing-impaired tracks", () => {
    expect(
      getMediaQualityBadges(
        itemWithSource([
          video(),
          subtitle({ DisplayTitle: "English" }),
          subtitle({ IsHearingImpaired: true }),
        ]),
      ),
    ).toEqual(["CC", "SDH"]);
  });

  test("adds AD for an audio track labelled as a description", () => {
    expect(
      getMediaQualityBadges(
        itemWithSource([
          video(),
          audio({ DisplayTitle: "English - Audio Description" }),
        ]),
      ),
    ).toEqual(["AD"]);
  });

  test("reads a top-level MediaStreams array when there is no MediaSources", () => {
    expect(
      getMediaQualityBadges({
        MediaStreams: [video({ Width: 3840 })],
      } as BaseItemDto),
    ).toEqual(["4K"]);
  });

  test("caps the badge line at five tokens", () => {
    const badges = getMediaQualityBadges(
      itemWithSource([
        video({ Width: 3840, VideoRangeType: "DOVI" }),
        audio({ Profile: "Dolby Atmos" }),
        audio({ DisplayTitle: "Audio Description" }),
        subtitle({ DisplayTitle: "English" }),
        subtitle({ IsHearingImpaired: true }),
      ]),
    );
    expect(badges).toHaveLength(5);
    expect(badges).toEqual(["4K", "Dolby Vision", "Atmos", "CC", "SDH"]);
  });
});
