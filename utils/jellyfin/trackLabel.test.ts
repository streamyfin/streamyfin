import { streamLanguageName, tagOriginalAudioTrack } from "./trackLabel";

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
