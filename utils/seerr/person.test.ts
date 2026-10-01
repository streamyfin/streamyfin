import { birthLine, personRoles } from "./person";
import { MediaType, type PersonCreditCast } from "./types";

const role = (
  id: number,
  mediaType: MediaType,
  voteCount: number,
  voteAverage = 7,
) => ({ id, mediaType, voteCount, voteAverage }) as unknown as PersonCreditCast;

// The titles a person played in, as their page lists them: the best known
// first, each once.
describe("personRoles", () => {
  test("lists the best known first", () => {
    const roles = personRoles([
      role(1, MediaType.MOVIE, 10),
      role(2, MediaType.MOVIE, 900),
      role(3, MediaType.TV, 50),
    ]);
    expect(roles.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  test("lists a title once, however many parts were played in it", () => {
    const roles = personRoles([
      role(1, MediaType.TV, 300),
      role(1, MediaType.TV, 300),
    ]);
    expect(roles).toHaveLength(1);
  });

  // TMDB numbers films and series apart: film 1399 and series 1399 are two
  // titles, and listing them by number alone lost the one less voted for.
  test("keeps a film and a series that share a number", () => {
    const roles = personRoles([
      role(1399, MediaType.TV, 20_000),
      role(1399, MediaType.MOVIE, 12),
    ]);
    expect(roles).toHaveLength(2);
  });

  test("has nothing to list without credits", () => {
    expect(personRoles(undefined)).toEqual([]);
  });
});

// The line under a person's name, as Seerr writes it (PersonDetails): "Born"
// and the date, then the place, joined by a bar, each only when Seerr has it.
describe("birthLine", () => {
  const t = (key: string) => (key === "seerr.born" ? "Born" : key);

  test("writes the birthday and the place", () => {
    expect(
      birthLine(
        t,
        {
          birthday: "1974-11-11",
          placeOfBirth: "Los Angeles, California, USA",
        },
        "en-US",
      ),
    ).toBe("Born November 11, 1974 | Los Angeles, California, USA");
  });

  // The phone wrote "Born  | Paris" without a birthday, and "Born  | "
  // with neither.
  test("leaves out what Seerr does not have", () => {
    expect(birthLine(t, { placeOfBirth: "Paris, France" }, "en-US")).toBe(
      "Paris, France",
    );
    expect(birthLine(t, { birthday: "1974-11-11" }, "en-US")).toBe(
      "Born November 11, 1974",
    );
  });

  test("has no line for a person with neither", () => {
    expect(birthLine(t, { birthday: null }, "en-US")).toBeUndefined();
    expect(birthLine(t, undefined, "en-US")).toBeUndefined();
  });
});
