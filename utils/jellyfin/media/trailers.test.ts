import type { TFunction } from "i18next";
import {
  pickTrailers,
  playerTitle,
  type Trailer,
  trailerLabels,
} from "./trailers";

const library = [{ Id: "lib-1", Name: "Theatrical trailer" }];
const remote = [{ url: "https://youtu.be/a", name: "Official trailer" }];

const sources = (trailers: Trailer[]) => trailers.map((t) => t.source);

describe("pickTrailers", () => {
  test("prefer library plays the library trailer first, remote after it", () => {
    expect(sources(pickTrailers("preferLibrary", library, remote))).toEqual([
      "library",
      "remote",
    ]);
  });

  test("prefer remote plays the remote trailer first, library after it", () => {
    expect(sources(pickTrailers("preferRemote", library, remote))).toEqual([
      "remote",
      "library",
    ]);
  });

  test("a preference falls back to the other source when its own has none", () => {
    expect(sources(pickTrailers("preferLibrary", [], remote))).toEqual([
      "remote",
    ]);
    expect(sources(pickTrailers("preferRemote", library, []))).toEqual([
      "library",
    ]);
  });

  test("library only never offers a remote trailer", () => {
    expect(sources(pickTrailers("libraryOnly", library, remote))).toEqual([
      "library",
    ]);
    expect(pickTrailers("libraryOnly", [], remote)).toEqual([]);
  });

  test("remote only never offers a library trailer", () => {
    expect(sources(pickTrailers("remoteOnly", library, remote))).toEqual([
      "remote",
    ]);
    expect(pickTrailers("remoteOnly", library, [])).toEqual([]);
  });

  test("keeps the order of each source's own trailers", () => {
    const trailers = pickTrailers(
      "preferLibrary",
      [{ Id: "lib-1" }, { Id: "lib-2" }],
      [{ url: "https://youtu.be/a" }, { url: "https://youtu.be/b" }],
    );

    expect(
      trailers.map((t) => (t.source === "library" ? t.id : t.url)),
    ).toEqual(["lib-1", "lib-2", "https://youtu.be/a", "https://youtu.be/b"]);
  });

  // Metadata providers list the same YouTube video under several names.
  test("drops a remote link it already has, and one without a url", () => {
    const trailers = pickTrailers(
      "remoteOnly",
      [],
      [
        { url: "https://youtu.be/a", name: "Trailer" },
        { url: "https://youtu.be/a", name: "Official trailer" },
        { url: null, name: "Broken" },
      ],
    );

    expect(trailers).toEqual([
      { source: "remote", url: "https://youtu.be/a", name: "Trailer" },
    ]);
  });

  test("skips a library trailer the server sent without an id", () => {
    expect(pickTrailers("libraryOnly", [{ Name: "No id" }], [])).toEqual([]);
  });
});

// Writes each key with its values, so a label shows how it was put together.
const t = ((key: string, values?: Record<string, unknown>) =>
  values?.count !== undefined
    ? "Trailer"
    : key === "item_card.trailer_numbered"
      ? `${values?.name} ${values?.number}`
      : `${values?.name} (${key === "item_card.trailer_library" ? "Library" : "Remote"})`) as unknown as TFunction;

const remoteNamed = (url: string, name?: string): Trailer => ({
  source: "remote",
  url,
  name,
});

describe("trailerLabels", () => {
  test("names each trailer with where it plays from", () => {
    expect(
      trailerLabels(t, [
        { source: "library", id: "lib-1", name: "Teaser", item: {} },
        remoteNamed("https://youtu.be/a", "Official trailer"),
      ]),
    ).toEqual(["Teaser (Library)", "Official trailer (Remote)"]);
  });

  // Providers name most remote trailers just "Trailer": a list of identical
  // entries gives no way to tell them apart.
  test("numbers the entries that would read the same, in list order", () => {
    expect(
      trailerLabels(t, [
        remoteNamed("https://youtu.be/a", "Trailer"),
        remoteNamed("https://youtu.be/b", "Teaser"),
        remoteNamed("https://youtu.be/c", "Trailer"),
      ]),
    ).toEqual(["Trailer 1 (Remote)", "Teaser (Remote)", "Trailer 2 (Remote)"]);
  });

  test("a library and a remote trailer of the same name need no number", () => {
    expect(
      trailerLabels(t, [
        { source: "library", id: "lib-1", name: "Trailer", item: {} },
        remoteNamed("https://youtu.be/a", "Trailer"),
      ]),
    ).toEqual(["Trailer (Library)", "Trailer (Remote)"]);
  });

  test("numbers unnamed trailers under the fallback name", () => {
    expect(
      trailerLabels(t, [
        remoteNamed("https://youtu.be/a"),
        remoteNamed("https://youtu.be/b"),
      ]),
    ).toEqual(["Trailer 1 (Remote)", "Trailer 2 (Remote)"]);
  });
});

describe("playerTitle", () => {
  const titleT = ((key: string, values?: { name?: string }) =>
    `${key}:${values?.name}`) as unknown as TFunction;

  // A library trailer is usually named after its film, so the player read
  // as the film itself playing.
  test("says a trailer is one", () => {
    expect(playerTitle(titleT, { Name: "Ratatouille", Type: "Trailer" })).toBe(
      "player.trailer_title:Ratatouille",
    );
  });

  test("says so for a video kept as a trailer extra too", () => {
    expect(
      playerTitle(titleT, {
        Name: "Ratatouille",
        Type: "Video",
        ExtraType: "Trailer",
      }),
    ).toBe("player.trailer_title:Ratatouille");
  });

  test("leaves any other item its own name", () => {
    expect(playerTitle(titleT, { Name: "Ratatouille", Type: "Movie" })).toBe(
      "Ratatouille",
    );
  });
});
