import {
  audioDisplayTitle,
  streamLanguageName,
  tagOriginalAudioTrack,
} from "./trackLabel";

describe("audioDisplayTitle", () => {
  // DisplayTitle as the server builds it for audio: the track title first,
  // then every attribute the title does not already contain.
  test("moves a release-name title behind the language", () => {
    // The reported case: the native iOS menu truncates after about three
    // lines, which a file name used as a title fills on its own.
    const title =
      "Game.of.Thrones.S02E03.What.is.Dead.May.Never.Die.2160p.BluRay.REMUX";
    expect(
      audioDisplayTitle({
        Title: title,
        Language: "ger",
        LocalizedLanguage: "German",
        DisplayTitle: `${title} - German - DTS - 5.1 - Default`,
      }),
    ).toBe(`German - DTS - 5.1 - Default - ${title}`);
  });

  test("moves a short title too, so every row of the list reads alike", () => {
    expect(
      audioDisplayTitle({
        Title: "Surround 5.1",
        Language: "eng",
        LocalizedLanguage: "English",
        DisplayTitle: "Surround 5.1 - English - DTS",
      }),
    ).toBe("English - DTS - Surround 5.1");
  });

  test("leaves a track without a title as the server wrote it", () => {
    expect(
      audioDisplayTitle({
        Language: "eng",
        LocalizedLanguage: "English",
        DisplayTitle: "English - AAC - Stereo",
      }),
    ).toBe("English - AAC - Stereo");
  });

  test("puts the language first when the title swallowed it", () => {
    // The server drops an attribute the title contains, so a title naming the
    // language leaves no language in the attribute part.
    expect(
      audioDisplayTitle({
        Title: "Show.S01E01.German.DL.1080p",
        Language: "ger",
        LocalizedLanguage: "German",
        DisplayTitle: "Show.S01E01.German.DL.1080p - Dolby Digital - 5.1",
      }),
    ).toBe("German - Dolby Digital - 5.1 - Show.S01E01.German.DL.1080p");
  });

  test("puts the language first when the title holds every attribute", () => {
    expect(
      audioDisplayTitle({
        Title: "Commentary German Stereo",
        Language: "ger",
        LocalizedLanguage: "German",
        DisplayTitle: "Commentary German Stereo",
      }),
    ).toBe("German - Commentary German Stereo");
  });

  test("matches the language whatever its case", () => {
    // The server upper-cases the first letter of a raw ISO code, an older
    // server sends no resolved name, so the label says "Ger" for "ger".
    expect(
      audioDisplayTitle({
        Title: "Main",
        Language: "ger",
        DisplayTitle: "Main - Ger - AAC",
      }),
    ).toBe("Ger - AAC - Main");
  });

  test("adds no language for the codes the server never shows", () => {
    for (const code of ["und", "mis", "mul", "zxx", "UND"]) {
      expect(
        audioDisplayTitle({
          Title: "Main",
          Language: code,
          DisplayTitle: "Main - AAC",
        }),
      ).toBe("AAC - Main");
    }
  });

  test("keeps a DisplayTitle that does not start with the title", () => {
    // Not the shape the server builds today. Rearranging a string we do not
    // understand could cut it in the wrong place.
    expect(
      audioDisplayTitle({
        Title: "Main",
        Language: "eng",
        LocalizedLanguage: "English",
        DisplayTitle: "English AAC (Main)",
      }),
    ).toBe("English AAC (Main)");
  });

  test("passes a missing DisplayTitle through for the caller's fallback", () => {
    expect(audioDisplayTitle({ Title: "Main" })).toBeUndefined();
    expect(audioDisplayTitle({ DisplayTitle: null })).toBeUndefined();
    expect(audioDisplayTitle({ DisplayTitle: "" })).toBeUndefined();
  });
});

describe("tagOriginalAudioTrack", () => {
  test("tags the original track when the label does not say so", () => {
    // A server that flags the track but sends no DisplayTitle leaves the menu
    // on its fallback label, which carries no marker of its own.
    expect(
      tagOriginalAudioTrack("Japanese (aac)", { IsOriginal: true }, "Original"),
    ).toBe("Japanese (aac) - Original");
  });

  test("leaves a track that is not the original alone", () => {
    expect(
      tagOriginalAudioTrack("English - AAC", { IsOriginal: false }, "Original"),
    ).toBe("English - AAC");
    // Servers before 12 do not send the field at all.
    expect(tagOriginalAudioTrack("English - AAC", {}, "Original")).toBe(
      "English - AAC",
    );
  });

  test("does not double the tag Jellyfin 12 already put in DisplayTitle", () => {
    expect(
      tagOriginalAudioTrack(
        "Japanese - AAC - Stereo - Original",
        { IsOriginal: true, LocalizedOriginal: "Original" },
        "Original",
      ),
    ).toBe("Japanese - AAC - Stereo - Original");
  });

  test("recognises the server's tag when the server and the app speak different languages", () => {
    // The server localizes its tag in its own language, the app in the user's.
    // Appending ours would read "Originalton - Original".
    expect(
      tagOriginalAudioTrack(
        "Japanisch - AAC - Stereo - Originalton",
        { IsOriginal: true, LocalizedOriginal: "Originalton" },
        "Version originale",
      ),
    ).toBe("Japanisch - AAC - Stereo - Originalton");
  });

  test("recognises the server's untranslated fallback", () => {
    // With no translation the server writes the English word and sends an
    // empty LocalizedOriginal.
    expect(
      tagOriginalAudioTrack(
        "Japanese - AAC - Original",
        { IsOriginal: true, LocalizedOriginal: "" },
        "Version originale",
      ),
    ).toBe("Japanese - AAC - Original");
  });

  test("recognises a track title that already names it, whatever the case", () => {
    // The server skips its own tag when the title contains it, so the title is
    // the only place the word appears.
    expect(
      tagOriginalAudioTrack(
        "ORIGINAL JAPANESE - AAC",
        { IsOriginal: true },
        "Original",
      ),
    ).toBe("ORIGINAL JAPANESE - AAC");
  });

  test("appends nothing when the tag itself is empty", () => {
    // i18next hands back an empty string for a blank catalogue entry.
    expect(tagOriginalAudioTrack("Japanese", { IsOriginal: true }, "")).toBe(
      "Japanese",
    );
  });

  test("returns the tag alone when there is no label to append to", () => {
    expect(tagOriginalAudioTrack("", { IsOriginal: true }, "Original")).toBe(
      "Original",
    );
  });
});

describe("streamLanguageName", () => {
  test("prefers the name Jellyfin 12 resolved over the ISO code", () => {
    expect(
      streamLanguageName({ LocalizedLanguage: "Japanese", Language: "jpn" }),
    ).toBe("Japanese");
  });

  test("falls back to the code on a server that sends no name", () => {
    expect(streamLanguageName({ Language: "jpn" })).toBe("jpn");
    expect(streamLanguageName({ LocalizedLanguage: "", Language: "jpn" })).toBe(
      "jpn",
    );
  });

  test("is undefined when the stream has no language", () => {
    expect(streamLanguageName({})).toBeUndefined();
    expect(streamLanguageName({ Language: null })).toBeUndefined();
  });
});
