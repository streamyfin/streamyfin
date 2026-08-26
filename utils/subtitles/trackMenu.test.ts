import type {
  MediaStream,
  SubtitleDeliveryMethod,
} from "@jellyfin/sdk/lib/generated-client";
import { localSubtitleIndex, SUBTITLES_OFF } from "./subtitleIndex";
import { buildAudioMenu, buildSubtitleMenu } from "./trackMenu";

const Encode = "Encode" as SubtitleDeliveryMethod;

const sub = (
  index: number | undefined,
  extra: Partial<MediaStream> = {},
): MediaStream => ({
  Type: "Subtitle",
  Index: index,
  IsTextSubtitleStream: true,
  ...extra,
});

const audio = (
  index: number | undefined,
  extra: Partial<MediaStream> = {},
): MediaStream => ({ Type: "Audio", Index: index, ...extra });

const base = { offLabel: "Off", isTranscoding: false, selectedIndex: -1 };

describe("buildSubtitleMenu", () => {
  test("drops streams with no Index instead of aliasing them to off", () => {
    // `?? -1` used to collapse these onto the "subtitles off" sentinel, which
    // then persisted "off" as the series preference for a track the user picked.
    const rows = buildSubtitleMenu(
      [sub(undefined, { DisplayTitle: "Broken" }), sub(2, { Language: "eng" })],
      base,
    );
    expect(rows.filter((r) => r.index === SUBTITLES_OFF)).toHaveLength(1);
    expect(rows.map((r) => r.index)).toEqual([SUBTITLES_OFF, 2]);
  });

  test("always leads with the off row and marks it selected when nothing is chosen", () => {
    const rows = buildSubtitleMenu([sub(0)], base);
    expect(rows[0].kind).toBe("off");
    expect(rows[0].selected).toBe(true);
  });

  test("carries the stream language onto the row", () => {
    // The row is what a per-series memory write reads, so the language must
    // travel with it rather than be re-derived from a possibly-stale list.
    const rows = buildSubtitleMenu([sub(3, { Language: "swe" })], base);
    expect(rows[1].language).toBe("swe");
    expect(rows[1].kind).toBe("server");
  });

  test("orders like jellyfin-web: in-container first, externals last", () => {
    const rows = buildSubtitleMenu(
      [sub(0, { IsExternal: true }), sub(1), sub(2, { IsExternal: true })],
      base,
    );
    expect(rows.map((r) => r.index)).toEqual([SUBTITLES_OFF, 1, 0, 2]);
  });

  describe("requiresReload", () => {
    const image = sub(1, { IsTextSubtitleStream: false });
    const text = sub(2, { Language: "eng" });

    test("is false when not transcoding, whatever the codec", () => {
      const rows = buildSubtitleMenu([image, text], {
        ...base,
        isTranscoding: false,
      });
      expect(rows.every((r) => !r.requiresReload)).toBe(true);
    });

    test("is set when switching TO an image sub under transcoding", () => {
      const rows = buildSubtitleMenu([image, text], {
        ...base,
        isTranscoding: true,
      });
      expect(rows.find((r) => r.index === 1)?.requiresReload).toBe(true);
      expect(rows.find((r) => r.index === 2)?.requiresReload).toBe(false);
    });

    test("is set when switching AWAY from an active image sub", () => {
      // The rule is a function of (current, target). Checking only the target
      // left the "turn this one off" case silently broken.
      const rows = buildSubtitleMenu([image, text], {
        ...base,
        isTranscoding: true,
        selectedIndex: 1,
      });
      expect(rows.find((r) => r.index === 2)?.requiresReload).toBe(true);
      expect(rows.find((r) => r.index === SUBTITLES_OFF)?.requiresReload).toBe(
        true,
      );
    });

    test("treats an Encode-delivered text sub as needing a re-process", () => {
      // The menus used to test only IsTextSubtitleStream while the resolver
      // tested DeliveryMethod, so a text sub the server chose to burn in was
      // offered as a cheap switch and failed.
      const encoded = sub(5, {
        IsTextSubtitleStream: true,
        DeliveryMethod: Encode,
      });
      const rows = buildSubtitleMenu([encoded], {
        ...base,
        isTranscoding: true,
      });
      expect(rows.find((r) => r.index === 5)?.requiresReload).toBe(true);
    });
  });

  describe("client-side sidecars", () => {
    test("appends them after the server tracks with distinct indexes", () => {
      const rows = buildSubtitleMenu([sub(0)], {
        ...base,
        localSubs: [
          { name: "Swedish.srt", filePath: "/a.srt" },
          { name: "English.srt", filePath: "/b.srt" },
        ],
      });
      const sidecars = rows.filter((r) => r.kind === "sidecar");
      expect(sidecars.map((r) => r.index)).toEqual([
        localSubtitleIndex(0),
        localSubtitleIndex(1),
      ]);
      expect(sidecars[0].localPath).toBe("/a.srt");
    });

    test("marks the active sidecar selected and no server row", () => {
      const rows = buildSubtitleMenu([sub(0)], {
        ...base,
        selectedIndex: localSubtitleIndex(1),
        localSubs: [
          { name: "a", filePath: "/a.srt" },
          { name: "b", filePath: "/b.srt" },
        ],
      });
      expect(rows.filter((r) => r.selected)).toHaveLength(1);
      expect(rows.find((r) => r.selected)?.localPath).toBe("/b.srt");
    });

    test("never marks a sidecar as needing a re-process", () => {
      // It exists only on the player handle; the server cannot re-negotiate it.
      const rows = buildSubtitleMenu([sub(0)], {
        ...base,
        isTranscoding: true,
        localSubs: [{ name: "a", filePath: "/a.srt" }],
      });
      expect(rows.find((r) => r.kind === "sidecar")?.requiresReload).toBe(
        false,
      );
    });
  });

  describe("offline transcoded downloads", () => {
    test("shows only the burned-in row when an image sub was baked in", () => {
      const rows = buildSubtitleMenu(
        [
          sub(1, { IsTextSubtitleStream: false, DisplayTitle: "Swedish" }),
          sub(2),
        ],
        { ...base, offlineTranscoded: { burnedInIndex: 1 } },
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].kind).toBe("burnedIn");
      expect(rows[0].label).toBe("Swedish (burned in)");
      expect(rows[0].selected).toBe(true);
    });

    test("keeps text subs switchable and drops image subs otherwise", () => {
      const rows = buildSubtitleMenu(
        [sub(1, { IsTextSubtitleStream: false }), sub(2, { Language: "eng" })],
        { ...base, offlineTranscoded: {} },
      );
      expect(rows.map((r) => r.index)).toEqual([SUBTITLES_OFF, 2]);
    });
  });
});

describe("buildAudioMenu", () => {
  test("drops streams with no Index", () => {
    const rows = buildAudioMenu([audio(undefined), audio(1)], {
      isTranscoding: false,
    });
    expect(rows.map((r) => r.index)).toEqual([1]);
  });

  test("marks every row as needing a re-process while transcoding", () => {
    const rows = buildAudioMenu([audio(1), audio(2)], { isTranscoding: true });
    expect(rows.every((r) => r.requiresReload)).toBe(true);
  });

  test("offers only the downloaded track for a transcoded download", () => {
    // The other tracks are not in the file, so listing them would offer audio
    // that can never play.
    const rows = buildAudioMenu([audio(1), audio(2)], {
      isTranscoding: false,
      offlineTranscoded: true,
      selectedIndex: 2,
    });
    expect(rows.map((r) => r.index)).toEqual([2]);
    expect(rows[0].selected).toBe(true);
  });

  test("carries the language for the series memory", () => {
    const rows = buildAudioMenu([audio(1, { Language: "jpn" })], {
      isTranscoding: false,
    });
    expect(rows[0].language).toBe("jpn");
  });
});
